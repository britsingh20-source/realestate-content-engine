import { buildLeadRecord, buildPrivateReply, detectLocalityKeyword } from './keywordRouter.js';

const GRAPH_HOST = process.env.INSTAGRAM_GRAPH_HOST || 'https://graph.instagram.com';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function postInstagramMessage({ recipientId, commentId, text }) {
  const igUserId = required('INSTAGRAM_IG_USER_ID');
  const accessToken = required('INSTAGRAM_ACCESS_TOKEN');
  const recipient = commentId ? { comment_id: commentId } : { id: recipientId };

  const response = await fetch(`${GRAPH_HOST}/${GRAPH_VERSION}/${igUserId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipient, message: { text } })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram reply failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return response.json();
}

async function sendToCrm(lead) {
  const url = process.env.CRM_LEAD_WEBHOOK_URL;
  if (!url) {
    console.log('CRM_LEAD_WEBHOOK_URL not configured; lead:', JSON.stringify(lead));
    return { skipped: true };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CRM_LEAD_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.CRM_LEAD_WEBHOOK_TOKEN}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(lead)
  });
  if (!response.ok) throw new Error(`CRM webhook failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json().catch(() => ({ ok: true }));
}

function parseCommentChanges(body) {
  const events = [];
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change.field !== 'comments') continue;
      const value = change.value || {};
      events.push({
        source: 'comment',
        senderId: value.from?.id || value.user?.id || null,
        username: value.from?.username || value.user?.username || null,
        text: value.text || '',
        mediaId: value.media?.id || value.media_id || null,
        commentId: value.id || value.comment_id || null,
        messageId: null
      });
    }
  }
  return events;
}

function parseMessaging(body) {
  const events = [];
  for (const entry of body?.entry || []) {
    for (const item of entry?.messaging || []) {
      const text = item.message?.text || item.postback?.title || '';
      if (!text || item.message?.is_echo) continue;
      events.push({
        source: 'dm',
        senderId: item.sender?.id || null,
        username: null,
        text,
        mediaId: null,
        commentId: null,
        messageId: item.message?.mid || null
      });
    }
  }
  return events;
}

export function verifyInstagramWebhook(requestUrl) {
  const url = new URL(requestUrl);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) return challenge;
  return null;
}

export async function processInstagramWebhook(body) {
  const events = [...parseCommentChanges(body), ...parseMessaging(body)];
  const results = [];

  for (const event of events) {
    const detected = await detectLocalityKeyword(event.text);
    if (!detected) {
      results.push({ ignored: true, reason: 'no-locality-keyword', event });
      continue;
    }

    const lead = buildLeadRecord({ ...event, campaignId: event.mediaId, detected });
    const crm = await sendToCrm(lead);
    const replyText = buildPrivateReply(detected);

    let instagramReply = null;
    if (event.source === 'comment' && event.commentId) {
      instagramReply = await postInstagramMessage({ commentId: event.commentId, text: replyText });
    } else if (event.source === 'dm' && event.senderId) {
      instagramReply = await postInstagramMessage({ recipientId: event.senderId, text: replyText });
    }

    results.push({ ok: true, lead, crm, instagramReply });
  }

  return { processed: events.length, results };
}
