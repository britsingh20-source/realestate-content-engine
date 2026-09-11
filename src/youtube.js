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
  // Reading a channel's uploads playlist costs only a few quota units; search.list
  // costs 100 units per call and exhausted the project's daily quota.
  const channel = await yt('channels', { part: 'contentDetails', id: channelId, maxResults: '1' });
  const uploadsId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsId) throw new Error(`Could not find uploads playlist for channel ${channelId}`);
  const playlist = await yt('playlistItems', {
    part: 'contentDetails', playlistId: uploadsId, maxResults: String(Math.min(maxResults, 50))
  });
  const cutoff = new Date(publishedAfter).getTime();
  const ids = (playlist.items || [])
    .filter(x => new Date(x.contentDetails?.videoPublishedAt || 0).getTime() >= cutoff)
    .map(x => x.contentDetails?.videoId)
    .filter(Boolean);
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
