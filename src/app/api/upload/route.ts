import { NextRequest, NextResponse } from 'next/server';
import { isR2Configured, uploadToR2 } from '@/lib/r2';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const pageId = (formData.get('pageId') as string) || 'global';
    const customKey = formData.get('key') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { 
          configured: false, 
          error: 'Cloudflare R2 is not configured on the server. Falling back to Supabase.' 
        }, 
        { status: 503 }
      );
    }

    const fileExt = file.name.split('.').pop() || 'bin';
    const key = customKey || `${pageId}/${uuidv4()}.${fileExt}`;
    const contentType = file.type || 'application/octet-stream';

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const publicUrl = await uploadToR2(key, buffer, contentType);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      key,
      size: file.size,
      type: contentType,
      storage: 'r2'
    });
  } catch (error: any) {
    console.error('R2 upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload to Cloudflare R2 failed' }, { status: 500 });
  }
}
