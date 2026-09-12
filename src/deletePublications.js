import fs from 'node:fs/promises';

const CONTENT_ID = String(process.env.CONTENT_ID || '').trim().toUpperCase();
if (!CONTENT_ID) throw new Error('Missing CONTENT_ID');

const path = `data/pending/${CONTENT_ID}.json`;
const record = JSON.parse(await fs.readFile(path, 'utf8'));
const targets = record.publishResult?.targets || {};
const apiVersion = process.env.META_GRAPH_VERSION || 'v23.0';

const routes = {
  olivetree_investors: 'INSTAGRAM_OLIVETREE_INVESTORS',
  olivetree_safebuy: 'INSTAGRAM_OLIVETREE_SAFEBUY',
  olivetree_builders: 'INSTAGRAM_OLIVETREE_BUILDERS'
};

const results = [];
for (const [brand, prefix] of Object.entries(routes)) {
  const token = process.env[`${prefix}_ACCESS_TOKEN`];
  if (!token) throw new Error(`Missing ${prefix}_ACCESS_TOKEN`);
  for (const field of ['instagramReel', 'instagramStory']) {
    const mediaId = targets[brand]?.[field]?.mediaId;
    if (!mediaId) throw new Error(`Missing recorded ${brand} ${field} media ID`);
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
      method: 'DELETE',
      body: new URLSearchParams({ access_token: token })
    });
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = { raw: body }; }
    results.push({ brand, field, mediaId, ok: response.ok && parsed?.success === true, response: parsed });
  }
}

const failed = results.filter(result => !result.ok);
console.log(JSON.stringify(results.map(({ brand, field, mediaId, ok, response }) => ({
  brand, field, mediaId, ok,
  error: ok ? undefined : response?.error?.message || response?.raw || JSON.stringify(response)
})), null, 2));

if (failed.length) {
  throw new Error(`Meta rejected ${failed.length} of ${results.length} deletions; publication record was left unchanged`);
}

record.republishHistory = [
  ...(record.republishHistory || []),
  {
    deletedAt: new Date().toISOString(),
    reason: 'User-requested delete and republish with brand-specific variants',
    publishResult: record.publishResult
  }
];
record.status = 'pending';
record.publishResult = {
  stagedVideo: record.publishResult.stagedVideo,
  targets: {}
};
delete record.publishedAt;
record.updatedAt = new Date().toISOString();
await fs.writeFile(path, JSON.stringify(record, null, 2));
console.log(`Deleted all recorded Instagram publications and reset ${CONTENT_ID} for republishing`);
