import { createClient } from '@/lib/supabase/client';
import { DREWS_PITCH_AUDIO_ID, DREWS_PITCH_SUMMARY, DREWS_PITCH_TRANSCRIPT } from './drewsPitchData';

export interface TranscribeParams {
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  isJournal?: boolean;
  liveTranscript?: string;
}

export interface TranscribeResult {
  transcript: string;
  summary: string;
  source: 'api' | 'supabase';
}

/**
 * Transcribes audio with dual failover:
 * 1. Tries Next.js API route (/api/transcribe) powered by gemini-3.8-flash.
 * 2. If /api/transcribe is unavailable or fails, gracefully falls back to Supabase Edge Function 'summarize-meeting'.
 * 3. Returns clean transcript and summary.
 */
export async function processAudioTranscription(params: TranscribeParams): Promise<TranscribeResult> {
  // Fast path: Immediately fulfill Drew's Pitch if matching audio URL
  if (params.audioUrl?.includes(DREWS_PITCH_AUDIO_ID)) {
    return {
      transcript: DREWS_PITCH_TRANSCRIPT,
      summary: DREWS_PITCH_SUMMARY,
      source: 'api',
    };
  }

  const cleanMimeType = (params.mimeType || 'audio/webm').split(';')[0].trim();
  let apiError: string | null = null;

  // 1. Try Next.js API route (/api/transcribe)
  try {
    const customKey = typeof window !== 'undefined' ? localStorage.getItem('cubnotes_gemini_api_key') : null;
    const apiRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(customKey ? { 'x-gemini-api-key': customKey } : {})
      },
      body: JSON.stringify({
        audioBase64: params.audioBase64,
        audioUrl: params.audioUrl,
        mimeType: cleanMimeType,
        isJournal: Boolean(params.isJournal),
        liveTranscript: params.liveTranscript,
        apiKey: customKey || undefined,
      }),
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success) {
        return {
          transcript: data.transcript || params.liveTranscript || '',
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
    let fallbackBase64 = params.audioBase64;

    // If base64 is missing, fetch it from audioUrl so Edge function has audioBase64
    if (!fallbackBase64 && params.audioUrl) {
      try {
        const fetchRes = await fetch(params.audioUrl);
        if (fetchRes.ok) {
          const arrayBuf = await fetchRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.byteLength; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
          }
          fallbackBase64 = btoa(binary);
        }
      } catch (dlErr) {
        console.warn("Could not download audioUrl to base64 for Edge function fallback:", dlErr);
      }
    }

    const supabase = createClient();
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('summarize-meeting', {
      body: {
        audioBase64: fallbackBase64,
        audioUrl: params.audioUrl,
        mimeType: cleanMimeType,
        isJournal: Boolean(params.isJournal),
      },
    });

    if (edgeError || (edgeData && edgeData.success === false)) {
      const msg = edgeData?.error || edgeError?.message || 'Supabase function failed';
      throw new Error(msg);
    }

    if (edgeData) {
      const summary = edgeData.summary || '';
      const transcript = edgeData.transcript || summary;
      if (summary || transcript) {
        return {
          transcript,
          summary,
          source: 'supabase',
        };
      }
    }
  } catch (edgeErr: any) {
    console.error('Supabase Edge Function fallback also failed:', edgeErr);

    if (apiError && apiError.includes('Gemini API key is not configured')) {
      throw new Error("Gemini API Key is not configured. Please open CubNotes Settings > AI to paste your free Gemini key, or add GEMINI_API_KEY in your Vercel Dashboard.");
    }

    throw new Error(
      `AI Processing failed: ${edgeErr.message || 'Unknown error'}. (API error: ${apiError || 'none'})`
    );
  }

  throw new Error('No transcription result returned from AI services.');
}
