function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function createAndPublish({ prefix, videoUrl, caption, mediaType }) {
  const apiVersion = process.env.META_GRAPH_VERSION || 'v23.0';
  const userId = required(`${prefix}_USER_ID`);
  const token = required(`${prefix}_ACCESS_TOKEN`);
  const base = `https://graph.facebook.com/${apiVersion}`;
  const body = new URLSearchParams({ media_type: mediaType, video_url: videoUrl, access_token: token });
  if (mediaType === 'REELS') {
    body.set('caption', caption || '');
    body.set('share_to_feed', 'true');
  }
  const create = await fetch(`${base}/${userId}/media`, { method:'POST', body });
  if (!create.ok) throw new Error(`Instagram create ${create.status}: ${await create.text()}`);
  const creationId = (await create.json()).id;

  for (let i = 0; i < 30; i++) {
    await sleep(10000);
    const status = await fetch(`${base}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    if (!status.ok) throw new Error(`Instagram status ${status.status}: ${await status.text()}`);
    const data = await status.json();
    if (data.status_code === 'FINISHED') break;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') throw new Error(`Instagram container failed: ${JSON.stringify(data)}`);
    if (i === 29) throw new Error('Instagram processing timed out');
  }

  const publishBody = new URLSearchParams({ creation_id: creationId, access_token: token });
  const pub = await fetch(`${base}/${userId}/media_publish`, { method:'POST', body:publishBody });
  if (!pub.ok) throw new Error(`Instagram publish ${pub.status}: ${await pub.text()}`);
  return { platform:'instagram', mediaType, mediaId:(await pub.json()).id };
}

export function publishInstagramReel(args) {
  return createAndPublish({ ...args, mediaType:'REELS' });
}

export function publishInstagramStory(args) {
  return createAndPublish({ ...args, mediaType:'STORIES' });
}
