import http from 'node:http';
import crypto from 'node:crypto';
import { processInstagramWebhook, verifyInstagramWebhook } from './instagramWebhook.js';

const PORT = Number(process.env.PORT || 8788);

function timingSafeEqualHex(a = '', b = '') {
  try {
    const aa = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true;
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqualHex(received, expected);
}

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { 'content-type': `${contentType}; charset=utf-8` });
  res.end(contentType === 'application/json' ? JSON.stringify(body) : String(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, service: 'instagram-keyword-leads' });
    }

    if (req.method === 'GET' && url.pathname === '/webhooks/instagram') {
      const challenge = verifyInstagramWebhook(url.toString());
      if (challenge !== null) return send(res, 200, challenge, 'text/plain');
      return send(res, 403, { error: 'Webhook verification failed' });
    }

    if (req.method === 'POST' && url.pathname === '/webhooks/instagram') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);

      if (!verifySignature(rawBody, req.headers['x-hub-signature-256'])) {
        return send(res, 401, { error: 'Invalid webhook signature' });
      }

      let body;
      try {
        body = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return send(res, 400, { error: 'Invalid JSON' });
      }

      // Acknowledge only after processing so failures are visible during setup.
      const result = await processInstagramWebhook(body);
      return send(res, 200, { received: true, ...result });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Instagram lead webhook error:', error);
    return send(res, 500, { error: error.message || 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`Instagram keyword lead webhook listening on :${PORT}`);
});
