import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Safety Guardrails: Prevent unexpected overages
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB per file
export const MAX_TOTAL_STORAGE_BYTES = 9.5 * 1024 * 1024 * 1024; // 9.5 GB safety cap (safely below 10 GB free tier)
export const MAX_MONTHLY_CLASS_A_OPS = 900_000; // 900k ops (safely below 1,000,000 free Class A writes)

// In-memory tracker for monthly operations
let monthlyClassAOps = 0;
let currentMonth = new Date().getMonth();

function checkMonthlyOpsLimit() {
  const month = new Date().getMonth();
  if (month !== currentMonth) {
    currentMonth = month;
    monthlyClassAOps = 0;
  }
  if (monthlyClassAOps >= MAX_MONTHLY_CLASS_A_OPS) {
    throw new Error('Monthly upload operations safety limit reached. Uploads are temporarily paused to prevent overage charges.');
  }
  monthlyClassAOps++;
}

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

// In-memory cache for total bucket usage (cached for 15 minutes to save Class A operations)
let cachedUsage: { totalBytes: number; objectCount: number; timestamp: number } | null = null;

export async function getBucketStorageUsage(): Promise<{ totalBytes: number; objectCount: number }> {
  if (!isR2Configured()) {
    return { totalBytes: 0, objectCount: 0 };
  }

  const now = Date.now();
  if (cachedUsage && now - cachedUsage.timestamp < 15 * 60 * 1000) {
    return { totalBytes: cachedUsage.totalBytes, objectCount: cachedUsage.objectCount };
  }

  try {
    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME;
    let totalBytes = 0;
    let objectCount = 0;
    let isTruncated = true;
    let continuationToken: string | undefined;

    while (isTruncated) {
      checkMonthlyOpsLimit();
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      if (res.Contents) {
        for (const obj of res.Contents) {
          totalBytes += obj.Size || 0;
          objectCount++;
        }
      }

      isTruncated = Boolean(res.IsTruncated);
      continuationToken = res.NextContinuationToken;
    }

    cachedUsage = { totalBytes, objectCount, timestamp: now };
    return { totalBytes, objectCount };
  } catch (err) {
    console.error('Failed to get R2 storage usage:', err);
    return cachedUsage ? { totalBytes: cachedUsage.totalBytes, objectCount: cachedUsage.objectCount } : { totalBytes: 0, objectCount: 0 };
  }
}

export function getR2PublicUrl(key: string): string {
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || process.env.R2_PUBLIC_URL;
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
  // 1. Single file size guard
  if (body.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size (${(body.byteLength / 1024 / 1024).toFixed(1)} MB) exceeds the 15 MB safety limit.`);
  }

  // 2. Class A Operations guard
  checkMonthlyOpsLimit();

  // 3. Monthly storage safety guard
  const { totalBytes } = await getBucketStorageUsage();
  if (totalBytes + body.byteLength > MAX_TOTAL_STORAGE_BYTES) {
    throw new Error('Cloudflare R2 free tier safety limit (9.5 GB) reached. Uploads are paused to prevent overage charges.');
  }

  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // CDN & Browser Cache: 1 year cache prevents repeat Class B read operations
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  // Update in-memory usage cache
  if (cachedUsage) {
    cachedUsage.totalBytes += body.byteLength;
    cachedUsage.objectCount += 1;
  }

  return getR2PublicUrl(key);
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!isR2Configured()) return;
  try {
    checkMonthlyOpsLimit();
    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME;
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    // Invalidate usage cache on deletion
    cachedUsage = null;
  } catch (err) {
    console.error('Failed to delete object from R2:', err);
  }
}
