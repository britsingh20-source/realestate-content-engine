function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function accessToken(prefix) {
  const body = new URLSearchParams({
    client_id: required('YOUTUBE_CLIENT_ID'),
    client_secret: required('YOUTUBE_CLIENT_SECRET'),
    refresh_token: required(`${prefix}_REFRESH_TOKEN`),
    grant_type: 'refresh_token'
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  if (!res.ok) throw new Error(`YouTube token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

export async function publishYouTubeShort({ prefix, bytes, contentType='video/mp4', title, description }) {
  const token = await accessToken(prefix);
  const metadata = {
    snippet: {
      title: String(title || 'Real Estate Short').slice(0, 100),
      description: `${description || ''}\n\n#Shorts`.slice(0, 5000),
      categoryId: '27'
    },
    status: { privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || 'public', selfDeclaredMadeForKids: false }
  };

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': contentType,
      'x-upload-content-length': String(bytes.byteLength)
    },
    body: JSON.stringify(metadata)
  });
  if (!init.ok) throw new Error(`YouTube initiate ${init.status}: ${await init.text()}`);
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube resumable upload URL missing');

  const uploaded = await fetch(location, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': contentType, 'content-length': String(bytes.byteLength) },
    body: bytes
  });
  if (!uploaded.ok) throw new Error(`YouTube upload ${uploaded.status}: ${await uploaded.text()}`);
  const data = await uploaded.json();
  return { platform:'youtube', videoId:data.id, url:`https://youtube.com/shorts/${data.id}` };
}
