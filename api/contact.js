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
const attempts = new Map();

function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(payload));
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function clientKey(req) {
  // Vercel sets x-real-ip at the edge; avoid trusting arbitrary forwarded lists.
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

module.exports = async function contact(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        return sendJson(res, 403, { error: 'Request origin is not allowed.' });
      }
    } catch {
      return sendJson(res, 403, { error: 'Request origin is not allowed.' });
    }
  }

  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    return sendJson(res, 415, { error: 'Use the website enquiry form.' });
  }

  let body;
  try {
    body = req.body;
  } catch {
    return sendJson(res, 400, { error: 'Please submit a valid enquiry.' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, { error: 'Please check the enquiry fields and try again.' });
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 8192) {
    return sendJson(res, 413, { error: 'Your enquiry is too large.' });
  }

  // Quietly accept honeypot submissions so bots do not learn how detection works.
  if (clean(body.website, 200)) return sendJson(res, 200, { ok: true });

  const name = clean(body.name, 100);
  const email = clean(body.email, 150);
  const service = clean(body.service, 80);
  const message = clean(body.message, 2000);
  const validEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
  if (!name || /[\r\n]/.test(name) || !validEmail || !SERVICES.has(service) || !message) {
    return sendJson(res, 400, { error: 'Please check your name, email, service, and message.' });
  }

  const retryAfter = consumeRateLimit(clientKey(req));
  if (retryAfter) {
    return sendJson(res, 429, { error: 'Too many enquiries. Please try again in a few minutes.' }, {
      'Retry-After': String(retryAfter),
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return sendJson(res, 503, { error: 'Enquiry delivery is not configured yet. Please try again later.' });
  }

  const text = [
    'New Kyrark engagement enquiry',
    '',
    `Name: ${name}`,
    `Work email: ${email}`,
    `Service: ${service}`,
    '',
    'Scope and objectives:',
    message,
  ].join('\n');
  const html = `<h1>New Kyrark engagement enquiry</h1><p><strong>Name:</strong> ${escapeHtml(name)}</p><p><strong>Work email:</strong> ${escapeHtml(email)}</p><p><strong>Service:</strong> ${escapeHtml(service)}</p><h2>Scope and objectives</h2><p>${escapeHtml(message).replace(/\r?\n/g, '<br>')}</p>`;

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
    });
    if (!response.ok) {
      // Do not return provider details or submitted data to the public client.
      console.error('Resend rejected an enquiry email with status', response.status);
      return sendJson(res, 502, { error: 'We could not deliver your enquiry. Please try again later.' });
    }
    return sendJson(res, 200, { ok: true });
  } catch {
    console.error('Resend request failed while delivering an enquiry email');
    return sendJson(res, 502, { error: 'We could not deliver your enquiry. Please try again later.' });
  }
};
