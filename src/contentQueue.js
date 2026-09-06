import fs from 'node:fs/promises';

const PATH = 'data/pending-content.json';

async function readAll() {
  try { return JSON.parse(await fs.readFile(PATH, 'utf8')); }
  catch { return []; }
}

async function writeAll(items) {
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(PATH, JSON.stringify(items, null, 2));
}

export function makeContentId(niche) {
  const d = new Date();
  const day = d.toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prefix = ({ investment:'INV', documentation:'DOC', land_selection:'LAND', construction:'CON', buyer_education:'BUY' })[niche] || 'CNT';
  return `${prefix}-${day}-${rand}`;
}

export async function addPending(item) {
  const items = await readAll();
  items.unshift(item);
  await writeAll(items.slice(0, 500));
}

export async function findPending(contentId) {
  return (await readAll()).find(x => x.contentId === contentId);
}

export async function markPublished(contentId, result) {
  const items = await readAll();
  const item = items.find(x => x.contentId === contentId);
  if (item) {
    item.status = 'published';
    item.publishedAt = new Date().toISOString();
    item.publishResult = result;
  }
  await writeAll(items);
}
