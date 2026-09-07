import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function cleanVtt(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const out = [];
  let previous = '';
  for (let line of lines) {
    line = line.trim();
    if (!line || line === 'WEBVTT' || line.startsWith('Kind:') || line.startsWith('Language:')) continue;
    if (/^\d+$/.test(line)) continue;
    if (/\d{2}:\d{2}(?::\d{2})?[\.,]\d{3}\s+-->/.test(line)) continue;
    line = line
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (!line || line === previous) continue;
    out.push(line);
    previous = line;
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

export async function extractYoutubeTranscript(url) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'olive-transcript-'));
  const output = path.join(dir, '%(id)s.%(ext)s');
  try {
    await execFileAsync('yt-dlp', [
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-langs', 'en.*,en,ta.*,ta',
      '--sub-format', 'vtt',
      '--no-warnings',
      '-o', output,
      url
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 120000 });

    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.vtt'));
    if (!files.length) return null;

    const preferred = files.sort((a, b) => {
      const score = f => (/\.en(?:[.-]|\.vtt$)/i.test(f) ? 0 : /\.ta(?:[.-]|\.vtt$)/i.test(f) ? 1 : 2);
      return score(a) - score(b);
    })[0];
    const raw = await fs.readFile(path.join(dir, preferred), 'utf8');
    const text = cleanVtt(raw);
    if (text.length < 120) return null;
    return { text, subtitleFile: preferred, chars: text.length };
  } catch (err) {
    console.warn(`Transcript unavailable for ${url}: ${err.message}`);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
