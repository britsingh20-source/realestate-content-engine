import fs from 'node:fs/promises';

const CONFIG_PATH = new URL('../../config/localityKeywords.json', import.meta.url);

function normalize(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function loadConfig() {
  return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
}

export async function detectLocalityKeyword(text) {
  const config = await loadConfig();
  const haystack = ` ${normalize(text)} `;

  for (const area of config.areas) {
    const candidates = [area.key, area.label, ...(area.aliases || [])];
    for (const candidate of candidates) {
      const needle = normalize(candidate);
      if (needle && haystack.includes(` ${needle} `)) {
        return {
          key: area.key,
          area: area.label,
          matched: candidate,
          telecaller: area.telecaller || config.defaultTelecaller
        };
      }
    }
  }

  return null;
}

export function buildLeadRecord({ source, senderId, username, text, mediaId, commentId, messageId, campaignId, detected }) {
  const now = new Date().toISOString();
  return {
    leadKey: `instagram:${senderId || username || commentId || messageId}`,
    source: 'instagram',
    sourceType: source,
    instagramSenderId: senderId || null,
    instagramUsername: username || null,
    incomingText: text || '',
    localityKeyword: detected?.key || null,
    interestedArea: detected?.area || null,
    assignedTelecaller: detected?.telecaller || null,
    campaignId: campaignId || mediaId || null,
    instagramMediaId: mediaId || null,
    instagramCommentId: commentId || null,
    instagramMessageId: messageId || null,
    status: detected ? 'NEW_KEYWORD_LEAD' : 'NEEDS_QUALIFICATION',
    createdAt: now,
    updatedAt: now
  };
}

export function buildPrivateReply(detected) {
  if (!detected) {
    return 'Thanks for contacting CoimbatoreVeedu Builders. Please reply with the area you are looking for, for example KALAPATTI, VADAVALLI, KARAMADAI or SARAVANAMPATTI.';
  }

  return `Thanks! We have noted your interest in ${detected.area}. Please reply here with your budget and whether you are looking for a Plot, Villa or Independent House. We will send matching properties privately.`;
}

export function mergeLead(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    createdAt: existing.createdAt || incoming.createdAt,
    localityKeyword: incoming.localityKeyword || existing.localityKeyword,
    interestedArea: incoming.interestedArea || existing.interestedArea,
    assignedTelecaller: incoming.assignedTelecaller || existing.assignedTelecaller,
    campaignId: incoming.campaignId || existing.campaignId,
    status: incoming.localityKeyword ? 'NEW_KEYWORD_LEAD' : (existing.status || incoming.status),
    updatedAt: new Date().toISOString()
  };
}
