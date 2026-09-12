import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BRAND_STYLES = {
  olivetree_builders: {
    label: 'OLIVETREE BUILDERS',
    color: '0x123B5D',
    video: 'eq=contrast=1.04:saturation=1.02'
  },
  olivetree_investors: {
    label: 'OLIVETREE INVESTORS',
    color: '0x8A6418',
    video: 'eq=contrast=1.02:saturation=1.06'
  },
  olivetree_safebuy: {
    label: 'OLIVETREE SAFEBUY',
    color: '0x176B45',
    video: 'eq=brightness=0.01:saturation=1.03'
  }
};

function filterFor(style) {
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  return [
    'scale=1096:1948:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    style.video,
    `drawbox=x=0:y=0:w=iw:h=142:color=${style.color}@0.90:t=fill:enable='lt(t,3.2)'`,
    `drawtext=fontfile=${font}:text='${style.label}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=48:enable='lt(t,3.2)'`,
    `drawbox=x=0:y=h-72:w=iw:h=72:color=${style.color}@0.72:t=fill`,
    `drawtext=fontfile=${font}:text='${style.label}':fontcolor=white:fontsize=28:x=(w-text_w)/2:y=h-52`
  ].join(',');
}

export async function createBrandVariant({ bytes, brand }) {
  const style = BRAND_STYLES[brand];
  if (!style) throw new Error(`Unknown publishing brand: ${brand}`);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'olivetree-variant-'));
  const input = path.join(dir, 'master.mp4');
  const output = path.join(dir, `${brand}.mp4`);

  try {
    await fs.writeFile(input, bytes);
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', input,
      '-map', '0:v:0', '-map', '0:a?',
      '-vf', filterFor(style),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      output
    ], { maxBuffer: 8 * 1024 * 1024 });
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
