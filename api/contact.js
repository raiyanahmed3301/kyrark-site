'use strict';

const DESTINATION = 'cursedblademaster@protonmail.com';
const SERVICES = new Set([
  'Red Team Operations',
  'Web Application Penetration Testing',
  'Threat Intelligence (early access)',
  'Other',
]);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 4;
const MAX_BODY_BYTES = 8192;
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const attempts = new Map();

function securityHeaders() {
  return {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
}

function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries({ ...securityHeaders(), ...headers })) {
    res.setHeader(name, value);
  }
  res.end(JSON.stringify(payload));
}

function sendRedirect(res, location) {
  res.statusCode = 303;
  for (const [name, value] of Object.entries(securityHeaders())) res.setHeader(name, value);
  res.setHeader('Location', location);
  res.end();
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function headerSafe(value) {
  return !/[\r\n]/.test(value);
}

function isEmail(value) {
  return EMAIL_RE.test(value) && headerSafe(value) && value.length <= 150;
}

function isFromAddress(value) {
  if (!value || !headerSafe(value) || value.length > 180) return false;
  const angled = value.match(/^([^<>]{1,80}) <([^<>]+)>$/);
  const email = (angled ? angled[2] : value).trim();
  return isEmail(email);
}

function clientKey(req) {
  // Vercel sets x-real-ip at the edge; avoid trusting client-supplied forwarded lists.
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

function consumeRateLimit(key, now = Date.now()) {
  const recent = (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    attempts.set(key, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
  }
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 1000) {
    for (const [entry, times] of attempts) {
      if (!times.length || now - times[times.length - 1] >= WINDOW_MS) attempts.delete(entry);
    }
  }
  return 0;
}

function requestHost(req) {
  return String(req.headers.host || '').toLowerCase();
}

function hostFrom(urlLike) {
  try {
    return new URL(urlLike).host.toLowerCase();
  } catch {
    return '';
  }
}

function isSameOrigin(req) {
  const host = requestHost(req);
  if (!host) return false;
  const origin = req.headers.origin;
  if (origin) return hostFrom(origin) === host;
  const referer = req.headers.referer || req.headers.referrer;
  if (referer) return hostFrom(referer) === host;
  return false;
}

function mediaType(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function parseUrlEncoded(raw) {
  const body = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    if (!Object.hasOwn(body, key)) body[key] = value;
  }
  return body;
}

function readRawBody(req, limit) {
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString('utf8'));
  if (!req.on) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const fail = (error) => {
      req.off?.('data', onData);
      req.off?.('end', onEnd);
      req.off?.('error', fail);
      reject(error);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error('payload too large');
        error.code = 'PAYLOAD_TOO_LARGE';
        fail(error);
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => resolve(Buffer.concat(chunks).toString('utf8'));
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', fail);
  });
}

async function readBody(req) {
  const type = mediaType(req.headers['content-type']);
  const existing = req.body;
  if (existing && typeof existing === 'object' && !Array.isArray(existing) && !Buffer.isBuffer(existing)) {
    return existing;
  }

  const raw = await readRawBody(req, MAX_BODY_BYTES);
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    const error = new Error('payload too large');
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }
  if (!raw) return {};
  if (type === 'application/json') return JSON.parse(raw);
  if (type === 'application/x-www-form-urlencoded') return parseUrlEncoded(raw);
  const error = new Error('unsupported');
  error.code = 'UNSUPPORTED_TYPE';
  throw error;
}

function wantsRedirect(req) {
  const type = mediaType(req.headers['content-type']);
  const accept = String(req.headers.accept || '');
  return type === 'application/x-www-form-urlencoded' && !accept.includes('application/json');
}

function honeypotFilled(body) {
  return Boolean(clean(body.website, 200) || clean(body.fax, 200) || clean(body.company_url, 200));
}

function reply(req, res, status, payload) {
  if (wantsRedirect(req)) {
    const sent = status === 200 && payload.ok;
    return sendRedirect(res, sent ? '/?sent=1#contact' : '/?error=1#contact');
  }
  return sendJson(res, status, payload, payload.retryAfter ? { 'Retry-After': String(payload.retryAfter) } : {});
}

module.exports = async function contact(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  if (!isSameOrigin(req)) {
    return sendJson(res, 403, { error: 'Request origin is not allowed.' });
  }

  const type = mediaType(req.headers['content-type']);
  if (type !== 'application/json' && type !== 'application/x-www-form-urlencoded') {
    return sendJson(res, 415, { error: 'Use the website enquiry form.' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    if (error.code === 'PAYLOAD_TOO_LARGE') {
      return reply(req, res, 413, { error: 'Your enquiry is too large.' });
    }
    if (error.code === 'UNSUPPORTED_TYPE') {
      return sendJson(res, 415, { error: 'Use the website enquiry form.' });
    }
    return reply(req, res, 400, { error: 'Please submit a valid enquiry.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return reply(req, res, 400, { error: 'Please check the enquiry fields and try again.' });
  }

  let encodedSize = 0;
  try {
    encodedSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return reply(req, res, 400, { error: 'Please submit a valid enquiry.' });
  }
  if (encodedSize > MAX_BODY_BYTES) {
    return reply(req, res, 413, { error: 'Your enquiry is too large.' });
  }

  // Quietly accept honeypot submissions so bots do not learn how detection works.
  if (honeypotFilled(body)) return reply(req, res, 200, { ok: true });

  const name = clean(body.name, 100);
  const organization = clean(body.organization, 120);
  const email = clean(body.email, 150);
  const service = clean(body.service, 80);
  const message = clean(body.message, 2000);
  const consent = ['on', 'true', 'yes', '1'].includes(String(body.consent || '').trim().toLowerCase());

  if (
    !name || !headerSafe(name)
    || (organization && !headerSafe(organization))
    || !isEmail(email)
    || !SERVICES.has(service)
    || !message
    || !consent
  ) {
    return reply(req, res, 400, { error: 'Please check your details, service, message, and consent.' });
  }

  const retryAfter = consumeRateLimit(clientKey(req));
  if (retryAfter) {
    return wantsRedirect(req)
      ? sendRedirect(res, '/?error=1#contact')
      : sendJson(res, 429, { error: 'Too many enquiries. Please try again in a few minutes.' }, {
        'Retry-After': String(retryAfter),
      });
  }

  const apiKey = req.env?.RESEND_API_KEY || process.env.RESEND_API_KEY;
  const from = req.env?.EMAIL_FROM || process.env.EMAIL_FROM;
  if (!apiKey || !isFromAddress(from)) {
    return reply(req, res, 503, { error: 'Enquiry delivery is not configured yet. Please try again later.' });
  }

  const text = [
    'New Kyrark engagement enquiry',
    '',
    `Name: ${name}`,
    organization ? `Organization: ${organization}` : 'Organization: (not provided)',
    `Work email: ${email}`,
    `Service: ${service}`,
    '',
    'Scope and objectives:',
    message,
  ].join('\n');
  const html = [
    '<h1>New Kyrark engagement enquiry</h1>',
    `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
    organization ? `<p><strong>Organization:</strong> ${escapeHtml(organization)}</p>` : '',
    `<p><strong>Work email:</strong> ${escapeHtml(email)}</p>`,
    `<p><strong>Service:</strong> ${escapeHtml(service)}</p>`,
    '<h2>Scope and objectives</h2>',
    `<p>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>`,
  ].join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [DESTINATION],
        reply_to: [email],
        subject: `Engagement enquiry: ${service}`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error('Resend rejected an enquiry email with status', response.status);
      return reply(req, res, 502, { error: 'We could not deliver your enquiry. Please try again later.' });
    }
    return reply(req, res, 200, { ok: true });
  } catch {
    console.error('Resend request failed while delivering an enquiry email');
    return reply(req, res, 502, { error: 'We could not deliver your enquiry. Please try again later.' });
  }
};
