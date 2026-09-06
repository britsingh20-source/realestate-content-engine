const API = 'https://www.googleapis.com/youtube/v3';

function key() {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('Missing YOUTUBE_API_KEY');
  return process.env.YOUTUBE_API_KEY;
}

async function yt(path, params) {
  const qs = new URLSearchParams({ ...params, key: key() });
  const res = await fetch(`${API}/${path}?${qs}`);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function resolveChannel(creator) {
  if (creator.channelId) return { ...creator, resolvedChannelId: creator.channelId, resolution: 'configured' };
  const data = await yt('search', { part: 'snippet', type: 'channel', maxResults: '5', q: creator.searchQuery || creator.name });
  const expected = creator.name.toLowerCase().split('/')[0].trim();
  const ranked = (data.items || []).map(item => ({
    channelId: item.snippet.channelId,
    title: item.snippet.title,
    description: item.snippet.description || ''
  }));
  const match = ranked.find(x => x.title.toLowerCase().includes(expected)) || ranked[0];
  if (!match) throw new Error(`Could not resolve channel for ${creator.name}`);
  return { ...creator, resolvedChannelId: match.channelId, resolvedTitle: match.title, resolution: 'youtube-search' };
}

export async function recentVideos(channelId, publishedAfter, maxResults = 25) {
  const search = await yt('search', {
    part: 'snippet', channelId, type: 'video', order: 'date', maxResults: String(Math.min(maxResults, 50)), publishedAfter
  });
  const ids = (search.items || []).map(x => x.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const details = await yt('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
  return (details.items || []).map(v => ({
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description || '',
    publishedAt: v.snippet.publishedAt,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    durationSeconds: isoDurationSeconds(v.contentDetails.duration),
    views: Number(v.statistics.viewCount || 0),
    likes: Number(v.statistics.likeCount || 0),
    comments: Number(v.statistics.commentCount || 0),
    url: `https://www.youtube.com/watch?v=${v.id}`
  }));
}

export function isoDurationSeconds(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}
