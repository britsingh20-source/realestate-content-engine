import fs from 'node:fs/promises';
import { recentVideos, resolveChannel } from './youtube.js';
import { viralScore } from './scoring/viralScore.js';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function median(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function tokenize(s) {
  return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9₹% ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
}

function similarity(a, b) {
  const A = tokenize(`${a.title} ${a.description}`);
  const B = tokenize(`${b.title} ${b.description}`);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}

function engagement(v) {
  return v.views > 0 ? (v.likes + v.comments * 2) / v.views : 0;
}

export async function runInvestmentMonitor(config) {
  const after = new Date(Date.now() - config.scanWindowDays * DAY).toISOString();
  const creators = [];

  for (const creator of config.creators.filter(c => c.enabled)) {
    const resolved = await resolveChannel(creator);
    const all = await recentVideos(resolved.resolvedChannelId, after, 35);
    const videos = all.filter(v => v.durationSeconds >= 15 && v.durationSeconds <= config.sourceVideoMaxSeconds);
    creators.push({ creator: resolved, videos });
  }

  const now = Date.now();
  const enriched = creators.map(group => {
    const sortedOlder = [...group.videos].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const baselineSet = sortedOlder.slice(1, 1 + config.baselineVideoCount);
    const baselineViews = Math.max(1, median(baselineSet.map(v => v.views)));
    const baselineVelocity = Math.max(1, median(baselineSet.map(v => {
      const age = Math.max(1, (now - new Date(v.publishedAt).getTime()) / HOUR);
      return v.views / age;
    })));
    const baselineEngagement = Math.max(0.0001, median(baselineSet.map(engagement)));

    return {
      ...group,
      baseline: { views: baselineViews, velocity: baselineVelocity, engagement: baselineEngagement },
      videos: group.videos.map(v => {
        const ageHours = Math.max(0.25, (now - new Date(v.publishedAt).getTime()) / HOUR);
        const velocity = v.views / ageHours;
        return {
          ...v,
          ageHours,
          velocity,
          outlier: v.views / baselineViews,
          velocityRatio: velocity / baselineVelocity,
          engagementRatio: engagement(v) / baselineEngagement
        };
      })
    };
  });

  const candidates = [];
  for (const group of enriched) {
    for (const v of group.videos) {
      if (v.outlier < config.breakoutMultipliers.candidate) continue;
      const peerMatches = [];
      for (const peer of enriched.filter(x => x.creator.key !== group.creator.key)) {
        let best = null;
        for (const pv of peer.videos) {
          const sim = similarity(v, pv);
          if (!best || sim > best.similarity) best = { ...pv, similarity: sim, creator: peer.creator.name };
        }
        if (best && best.similarity >= 0.12 && best.outlier >= 2) peerMatches.push(best);
      }
      const confirmations = peerMatches.length;
      const score = viralScore({
        outlier: v.outlier,
        velocityRatio: v.velocityRatio,
        confirmations,
        engagementRatio: v.engagementRatio,
        ageHours: v.ageHours
      });
      candidates.push({
        niche: 'investment',
        creator: group.creator.name,
        creatorKey: group.creator.key,
        source: v,
        confirmations,
        peerMatches,
        viralScore: score,
        priority: v.outlier >= 5 ? 'priority' : v.outlier >= 3 ? 'strong' : 'candidate'
      });
    }
  }

  candidates.sort((a, b) => b.viralScore - a.viralScore || b.source.outlier - a.source.outlier);
  return {
    scannedAt: new Date().toISOString(),
    creators: enriched.map(x => ({ creator: x.creator, baseline: x.baseline, videoCount: x.videos.length })),
    candidates
  };
}

export async function saveReport(report, path = 'data/investment-latest.json') {
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(path, JSON.stringify(report, null, 2));
}
