import { createClient } from '@/lib/supabase/client';
import { compressImage } from './imageCompression';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient();

export interface UploadResult {
  url: string;
  storage: 'r2' | 'supabase';
  key: string;
}

/**
 * Universal file uploader:
 * 1. Automatically compresses camera photos & images to high-efficiency WebP.
 * 2. Tries Cloudflare R2 first (10 GB free + zero egress fees).
 * 3. Gracefully falls back to Supabase Storage if R2 is not configured.
 */
export async function uploadMediaFile(
  file: File,
  pageId: string,
  bucket = 'recordings'
): Promise<UploadResult> {
  let fileToUpload: Blob | File = file;
  let filename = file.name;

  // Auto-compress images in browser
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml' && file.type !== 'image/gif') {
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
    console.warn('R2 upload failed or unconfigured, falling back to Supabase:', err);
  }

  // 2. Fallback to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(key, fileToUpload, {
      contentType: fileToUpload.type || file.type,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(key);

  return {
    url: publicUrl,
    storage: 'supabase',
    key,
  };
}
