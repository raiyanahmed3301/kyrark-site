'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/contact');

function invoke({ method = 'POST', body, ip = `test-${Math.random()}`, origin = 'https://example.test', host = 'example.test', contentType = 'application/json', accept = 'application/json', rawBody } = {}) {
  const headers = {};
  let result;
  const req = {
    method,
    headers: { origin, host, 'content-type': contentType, accept, 'x-real-ip': ip },
    socket: { remoteAddress: ip },
    body: rawBody === undefined ? body : rawBody,
  };
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(value) {
      const location = headers.location;
      result = {
        status: this.statusCode,
        headers,
        location,
        body: value ? JSON.parse(value) : null,
      };
    },
  };
  return handler(req, res).then(() => result);
}

const validBody = {
  name: 'Ada Lovelace',
  organization: 'Analytical Engines',
  email: 'ada@example.org',
  service: 'Red Team Operations',
  message: 'Please scope an authorized assessment.',
  consent: 'yes',
  fax: '',
};

test('rejects methods other than POST', async () => {
  const result = await invoke({ method: 'GET' });
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'POST');
});

test('rejects cross-origin submissions', async () => {
  const result = await invoke({ body: validBody, origin: 'https://attacker.test' });
  assert.equal(result.status, 403);
});

test('rejects submissions with no origin or referer', async () => {
  const result = await invoke({ body: validBody, origin: '' });
  assert.equal(result.status, 403);
});

test('validates required fields before contacting the mail provider', async () => {
  const priorFetch = global.fetch;
  global.fetch = async () => { throw new Error('provider must not be called'); };
  try {
    const result = await invoke({ body: { ...validBody, email: 'bad' } });
    assert.equal(result.status, 400);
  } finally {
    global.fetch = priorFetch;
  }
});

test('requires consent before contacting the mail provider', async () => {
  const priorFetch = global.fetch;
  global.fetch = async () => { throw new Error('provider must not be called'); };
  try {
    const result = await invoke({ body: { ...validBody, consent: '' } });
    assert.equal(result.status, 400);
  } finally {
    global.fetch = priorFetch;
  }
});

test('rejects header injection in the name field', async () => {
  const priorFetch = global.fetch;
  global.fetch = async () => { throw new Error('provider must not be called'); };
  try {
    const result = await invoke({ body: { ...validBody, name: 'Ada\r\nBcc: attacker@example.org' } });
    assert.equal(result.status, 400);
  } finally {
    global.fetch = priorFetch;
  }
});

test('sends three correctly addressed enquiries through the provider API', async () => {
  const priorFetch = global.fetch;
  const priorKey = process.env.RESEND_API_KEY;
  const priorFrom = process.env.EMAIL_FROM;
  const sends = [];
  process.env.RESEND_API_KEY = 're_test_only';
  process.env.EMAIL_FROM = 'Kyrark <enquiries@example.test>';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer re_test_only');
    sends.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: `mock-${sends.length}` }), { status: 200 });
  };

  try {
    for (let i = 0; i < 3; i++) {
      const result = await invoke({ body: { ...validBody, message: `Test enquiry ${i + 1}` }, ip: `mock-send-${i}` });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { ok: true });
    }
    assert.equal(sends.length, 3);
    for (const payload of sends) {
      assert.deepEqual(payload.to, ['cursedblademaster@protonmail.com']);
      assert.deepEqual(payload.reply_to, ['ada@example.org']);
      assert.match(payload.subject, /^Engagement enquiry:/);
      assert.match(payload.text, /Analytical Engines/);
    }
  } finally {
    global.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorKey;
    if (priorFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = priorFrom;
  }
});

test('does not call the provider for a honeypot submission', async () => {
  const priorFetch = global.fetch;
  global.fetch = async () => { throw new Error('provider must not be called'); };
  try {
    const result = await invoke({ body: { ...validBody, fax: 'bot-filled-this' } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true });
  } finally {
    global.fetch = priorFetch;
  }
});

test('does not expose configuration details when mail is not configured', async () => {
  const priorKey = process.env.RESEND_API_KEY;
  const priorFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  try {
    const result = await invoke({ body: validBody, ip: 'unconfigured-ip' });
    assert.equal(result.status, 503);
    assert.equal(result.body.error.includes('RESEND'), false);
    assert.equal(result.body.error.includes('EMAIL_FROM'), false);
  } finally {
    if (priorKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorKey;
    if (priorFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = priorFrom;
  }
});

test('redirects non-JS form posts after a honeypot submission', async () => {
  const result = await invoke({
    body: { ...validBody, fax: 'bot' },
    contentType: 'application/x-www-form-urlencoded',
    accept: 'text/html',
  });
  assert.equal(result.status, 303);
  assert.equal(result.headers.location, '/?sent=1#contact');
});
