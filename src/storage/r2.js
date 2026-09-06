import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function client() {
  return new S3Client({
    region: 'auto',
    endpoint: required('R2_ENDPOINT'),
    credentials: {
      accessKeyId: required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY')
    }
  });
}

export async function uploadVideoToR2({ bytes, contentType='video/mp4', key }) {
  await client().send(new PutObjectCommand({
    Bucket: required('R2_BUCKET'),
    Key: key,
    Body: bytes,
    ContentType: contentType
  }));
  const base = required('R2_PUBLIC_BASE_URL').replace(/\/$/, '');
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
