import { createClient } from '@/lib/supabase/client';
import { compressImage } from './imageCompression';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient();

export interface UploadResult {
  url: string;
  storage: 'r2' | 'supabase' | 'local';
  key: string;
}

/**
 * Universal file uploader:
 * 1. Automatically compresses camera photos & images to high-efficiency WebP.
 * 2. Tries Cloudflare R2 first (10 GB free + zero egress fees).
 * 3. Gracefully falls back to Supabase Storage.
 * 4. If cloud storage is not yet set up, falls back to a reliable local object URL so user flow is never blocked.
 */
export async function uploadMediaFile(
  file: File | Blob,
  pageId: string,
  bucket = 'recordings'
): Promise<UploadResult> {
  // Client-side file size guard (15 MB)
  if (file.size > 15 * 1024 * 1024) {
    throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)} MB) exceeds the 15 MB limit.`);
  }

  let fileToUpload: Blob | File = file;
  let filename = (file instanceof File) ? file.name : `recording_${Date.now()}.webm`;

  // Auto-compress images in browser
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml' && file.type !== 'image/gif' && file instanceof File) {
    try {
      fileToUpload = await compressImage(file);
      filename = `${file.name.replace(/\.[^/.]+$/, '')}.webp`;
    } catch (e) {
      console.warn('Image compression failed, using original file:', e);
      fileToUpload = file;
    }
  }

  const ext = filename.split('.').pop() || 'bin';
  const key = `${pageId}/${uuidv4()}.${ext}`;

  // 1. Try Cloudflare R2 via Next.js API
  try {
    const formData = new FormData();
    formData.append('file', fileToUpload, filename);
    formData.append('pageId', pageId);
    formData.append('key', key);

    const r2Res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (r2Res.ok) {
      const data = await r2Res.json();
      if (data.url) {
        return {
          url: data.url,
          storage: 'r2',
          key: data.key || key,
        };
      }
    }
  } catch (err) {
    console.warn('R2 upload skipped or unavailable:', err);
  }

  // 2. Fallback to Supabase Storage (try specified bucket, then common alternatives)
  const candidateBuckets = [bucket, 'recordings', 'cubnotes-media', 'notes-media'];
  const triedBuckets = new Set<string>();

  for (const targetBucket of candidateBuckets) {
    if (triedBuckets.has(targetBucket)) continue;
    triedBuckets.add(targetBucket);

    try {
      const { error: uploadError } = await supabase.storage
        .from(targetBucket)
        .upload(key, fileToUpload, {
          contentType: fileToUpload.type || 'application/octet-stream',
          upsert: true,
        });

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from(targetBucket)
          .getPublicUrl(key);

        return {
          url: publicUrl,
          storage: 'supabase',
          key,
        };
      } else {
        console.warn(`Supabase upload to '${targetBucket}' failed:`, uploadError.message);
      }
    } catch (sbErr) {
      console.warn(`Supabase storage attempt to '${targetBucket}' failed:`, sbErr);
    }
  }

  // 3. Fallback: generate local Object URL so playback/transcription continues seamlessly
  console.warn('Cloud storage upload unavailable; falling back to local Blob URL.');
  const localUrl = typeof window !== 'undefined' ? URL.createObjectURL(fileToUpload) : '';

  return {
    url: localUrl,
    storage: 'local',
    key,
  };
}
