import contact from '../../api/contact.js';

// Cloudflare Pages Functions adapter for the shared contact handler.
export async function onRequestPost({ request, env }) {
  const contentType = request.headers.get('content-type') || '';
  let body;
  try {
    if (contentType.toLowerCase().includes('application/json')) {
      body = await request.json();
    } else if (contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries((await request.formData()).entries());
    } else {
      return Response.json({ error: 'Use the website enquiry form.' }, { status: 415 });
    }
  } catch {
    return Response.json({ error: 'Please submit a valid enquiry.' }, { status: 400 });
  }

  let status = 200;
  const responseHeaders = new Headers();
  const res = {
    setHeader(name, value) { responseHeaders.set(name, value); },
    end(payload) { this.payload = payload; },
  };
  const headers = Object.fromEntries(request.headers.entries());
  const req = {
    method: request.method,
    headers,
    body,
    env,
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || 'unknown' },
  };

  Object.defineProperty(res, 'statusCode', {
    get() { return status; },
    set(value) { status = value; },
  });

  await contact(req, res);
  return new Response(res.payload ?? null, { status, headers: responseHeaders });
}
