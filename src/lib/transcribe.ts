import { createClient } from '@/lib/supabase/client';

export interface TranscribeParams {
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  isJournal?: boolean;
}

export interface TranscribeResult {
  transcript: string;
  summary: string;
  source: 'api' | 'supabase';
}

/**
 * Transcribes audio with dual failover:
 * 1. Tries Next.js API route (/api/transcribe) powered by gemini-2.5-flash.
 * 2. If /api/transcribe is unavailable or fails, gracefully falls back to Supabase Edge Function 'summarize-meeting'.
 * 3. Returns clean transcript and summary.
 */
export async function processAudioTranscription(params: TranscribeParams): Promise<TranscribeResult> {
  const cleanMimeType = (params.mimeType || 'audio/webm').split(';')[0].trim();
  let apiError: string | null = null;

  // 1. Try Next.js API route (/api/transcribe)
  try {
    const apiRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64: params.audioBase64,
        audioUrl: params.audioUrl,
        mimeType: cleanMimeType,
        isJournal: Boolean(params.isJournal),
      }),
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success) {
        return {
          transcript: data.transcript || '',
          summary: data.summary || '',
          source: 'api',
        };
      } else if (data.error) {
        apiError = data.error;
      }
    } else {
      const errText = await apiRes.text().catch(() => '');
      apiError = `HTTP ${apiRes.status}: ${errText || apiRes.statusText}`;
    }
  } catch (err: any) {
    apiError = err.message || String(err);
  }

  console.warn('/api/transcribe route encountered an issue, trying Supabase Edge Function fallback...', apiError);

  // 2. Fallback to Supabase Edge Function ('summarize-meeting')
  try {
    const supabase = createClient();
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('summarize-meeting', {
      body: {
        audioBase64: params.audioBase64,
        audioUrl: params.audioUrl,
        mimeType: cleanMimeType,
        isJournal: Boolean(params.isJournal),
      },
    });

    if (edgeError || (edgeData && edgeData.success === false)) {
      const msg = edgeData?.error || edgeError?.message || 'Supabase function failed';
      throw new Error(msg);
    }

    if (edgeData && edgeData.success) {
      return {
        transcript: edgeData.transcript || '',
        summary: edgeData.summary || '',
        source: 'supabase',
      };
    }
  } catch (edgeErr: any) {
    console.error('Supabase Edge Function fallback also failed:', edgeErr);
    // Combine error descriptions for troubleshooting
    throw new Error(
      `AI Processing failed: ${edgeErr.message || 'Unknown error'}. (API error: ${apiError || 'none'})`
    );
  }

  throw new Error('No transcription result returned from AI services.');
}
