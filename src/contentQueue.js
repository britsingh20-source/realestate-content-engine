import fs from 'node:fs/promises';

const LEGACY_PATH = 'data/pending-content.json';
const RECORD_DIR = 'data/pending';

async function readLegacy() {
  try { return JSON.parse(await fs.readFile(LEGACY_PATH, 'utf8')); }
  catch { return []; }
}

function recordPath(contentId) {
  return `${RECORD_DIR}/${contentId}.json`;
}

async function readRecord(contentId) {
  try { return JSON.parse(await fs.readFile(recordPath(contentId), 'utf8')); }
  catch { return null; }
}

async function writeRecord(item) {
  await fs.mkdir(RECORD_DIR, { recursive: true });
  await fs.writeFile(recordPath(item.contentId), JSON.stringify(item, null, 2));
}

export function makeContentId(niche) {
  const d = new Date();
  const day = d.toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prefix = ({ investment:'INV', documentation:'DOC', land_selection:'LAND', construction:'CON', buyer_education:'BUY' })[niche] || 'CNT';
  return `${prefix}-${day}-${rand}`;
}

async function readAllRecords() {
  let files = [];
  try { files = (await fs.readdir(RECORD_DIR)).filter(name => name.endsWith('.json')); }
  catch {}
  const records = [];
  for (const name of files) {
    try { records.push(JSON.parse(await fs.readFile(`${RECORD_DIR}/${name}`, 'utf8'))); }
    catch {}
  }
  return [...records, ...(await readLegacy())];
}

export async function usedSourceIds({ brand, niche } = {}) {
  const ids = new Set();
  for (const item of await readAllRecords()) {
    if (brand && item.brand !== brand) continue;
    if (niche && item.niche !== niche) continue;
    const id = item.candidate?.source?.id;
    if (id) ids.add(String(id));
  }
  return ids;
}

export async function addPending(item) {
  await writeRecord(item);
}

export async function findPending(contentId) {
  const direct = await readRecord(contentId);
  if (direct) return direct;
  return (await readLegacy()).find(x => x.contentId === contentId);
}

export async function savePublishProgress(contentId, patch) {
  let item = await readRecord(contentId);
  if (!item) item = (await readLegacy()).find(x => x.contentId === contentId);
  if (!item) return null;
  item.publishResult = { ...(item.publishResult || {}), ...(patch || {}) };
  item.updatedAt = new Date().toISOString();
  await writeRecord(item);
  return item;
}

export async function markPublished(contentId, result) {
  let item = await readRecord(contentId);
  if (!item) item = (await readLegacy()).find(x => x.contentId === contentId);
  if (!item) return null;
  item.status = 'published';
  item.publishedAt = new Date().toISOString();
  item.publishResult = { ...(item.publishResult || {}), ...(result || {}) };
  await writeRecord(item);
  return item;
}
