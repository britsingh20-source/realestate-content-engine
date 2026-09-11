export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Not found', { status: 404 });

    const url = new URL(request.url);
    if (!env.WEBHOOK_SECRET || url.pathname !== `/telegram/${env.WEBHOOK_SECRET}`) {
      return new Response('Not found', { status: 404 });
    }

    let update;
    try { update = await request.json(); }
    catch { return new Response('Bad request', { status: 400 }); }

    if (!Number.isSafeInteger(update?.update_id)) return new Response('Bad request', { status: 400 });

    const message = update?.message;
    const chatId = String(message?.chat?.id || '');
    if (!message || chatId !== String(env.TELEGRAM_CHAT_ID)) {
      return new Response('ok');
    }

    const updateKey = `update:${update.update_id}`;
    if (await env.PAIRING_STATE.get(updateKey)) return new Response('ok');

    const text = String(message.caption || message.text || '').trim();
    const explicit = extractContentId(text) || extractContentId(message.reply_to_message?.text || message.reply_to_message?.caption);
    const attachment = videoAttachment(message);

    if (!attachment) {
      if (!explicit) return new Response('ok');
      await env.PAIRING_STATE.put(`pending-id:${chatId}`, explicit, { expirationTtl: 900 });
      await telegram(env, 'sendMessage', {
        chat_id: chatId,
        text: `✅ VIDEO ID saved: ${explicit}\nSend the MP4 within 15 minutes. It will be paired automatically and publishing will start immediately.`,
      });
      return new Response('ok');
    }

    const contentId = explicit || await env.PAIRING_STATE.get(`pending-id:${chatId}`);
    if (!contentId) {
      await telegram(env, 'sendMessage', {
        chat_id: chatId,
        text: '⚠️ I received the video but could not find its VIDEO ID. Send the exact ID (for example INV-20260911-AB12) and then resend the MP4 within 15 minutes.',
      });
      return new Response('ok');
    }

    message.caption = `VIDEO ID: ${contentId}`;

    const dispatched = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'olivetree-content-telegram-worker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'telegram-content-upload',
          client_payload: { update, content_id: contentId, source: 'cloudflare-telegram-webhook' },
        }),
      },
    );

    if (!dispatched.ok) {
      console.error(JSON.stringify({ event: 'dispatch_failed', update_id: update.update_id, status: dispatched.status }));
      await telegram(env, 'sendMessage', {
        chat_id: chatId,
        text: `⚠️ Upload received and paired to ${contentId}, but publishing could not start. GitHub dispatch returned ${dispatched.status}. Telegram will retry this upload.`,
      });
      return new Response('dispatch failed', { status: 502 });
    }

    // Record completion only after GitHub accepts the dispatch so failures remain retryable.
    await env.PAIRING_STATE.put(updateKey, '1', { expirationTtl: 86400 });
    console.log(JSON.stringify({ event: 'dispatch_accepted', update_id: update.update_id, content_id: contentId }));
    await env.PAIRING_STATE.delete(`pending-id:${chatId}`);
    await telegram(env, 'sendMessage', {
      chat_id: chatId,
      text: `✅ ${contentId} paired successfully. Social publishing has started now. Duplicate protection is active. Target: complete within 10 minutes.`,
    });

    return new Response('ok');
  },
};

function extractContentId(text) {
  const match = String(text || '').match(/\b(?:INV|DOC|LAND|CON|BUY)-\d{8}-[A-Z0-9]{4}\b/i);
  return match ? match[0].toUpperCase() : '';
}

function videoAttachment(message) {
  if (message.video) return message.video;
  const doc = message.document;
  const mime = String(doc?.mime_type || '').toLowerCase();
  const name = String(doc?.file_name || '').toLowerCase();
  return doc && (mime.startsWith('video/') || name.endsWith('.mp4')) ? doc : null;
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed: ${response.status}`);
}
