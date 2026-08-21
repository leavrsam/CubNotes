import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

export function getR2Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Cloudflare R2 credentials are not fully configured in environment variables.');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export function getR2PublicUrl(key: string): string {
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (publicDomain) {
    const cleanDomain = publicDomain.replace(/\/+$/, '');
    return `${cleanDomain}/${key}`;
  }
  // Fallback direct endpoint pattern
  return `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${key}`;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return getR2PublicUrl(key);
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!isR2Configured()) return;
  try {
    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME;
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (err) {
    console.error('Failed to delete object from R2:', err);
  }
}
