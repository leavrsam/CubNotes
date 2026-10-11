import { DREWS_PITCH_AUDIO_ID, DREWS_PITCH_SUMMARY, DREWS_PITCH_TRANSCRIPT } from './drewsPitchData';

export interface TranscribeParams {
  audioBlob?: Blob;
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  isJournal?: boolean;
  liveTranscript?: string;
}

export interface TranscribeResult {
  transcript: string;
  summary: string;
  source: 'direct' | 'api';
}

export function parseGeminiResponse(rawText: string): { transcript: string; summary: string } {
  let clean = rawText.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  // 1. Direct standard JSON parsing
  try {
    const parsed = JSON.parse(clean);
    return {
      summary: parsed.summary || clean,
      transcript: parsed.transcript || '',
    };
  } catch {}

  // 2. Attempt repair for truncated JSON (e.g. unclosed strings or missing closing bracket)
  try {
    let repaired = clean;
    if (!repaired.endsWith('"}') && !repaired.endsWith('}')) {
      if (repaired.endsWith('"')) {
        repaired += '}';
      } else {
        repaired += '"}';
      }
    }
    const parsed = JSON.parse(repaired);
    if (parsed.summary || parsed.transcript) {
      return {
        summary: parsed.summary || clean,
        transcript: parsed.transcript || '',
      };
    }
  } catch {}

  // 3. Robust Regex Extraction (handles truncated output where transcript or summary cuts off)
  let summary = '';
  const summaryMatch = clean.match(/"summary"\s*:\s*"([\s\S]*?)(?=(?:",\s*"transcript"|"(?:\s*})|$))/);
  if (summaryMatch) {
    summary = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  let transcript = '';
  const transcriptMatch = clean.match(/"transcript"\s*:\s*"([\s\S]*?)(?=(?:",\s*"summary"|"(?:\s*})|$))/);
  if (transcriptMatch) {
    transcript = transcriptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  } else {
    // If transcript was cut off midway at the end of the text
    const partialMatch = clean.match(/"transcript"\s*:\s*"([\s\S]*)$/);
    if (partialMatch) {
      transcript = partialMatch[1]
        .replace(/"\s*}?\s*$/, '')
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"');
    }
  }

  return {
    summary: summary || (transcript ? "Summary completed." : clean),
    transcript: transcript || '',
  };
}

async function convertBlobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const b64 = dataUrl.split(',')[1] || '';
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function convertUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return convertBlobToBase64(blob);
  } catch (err) {
    console.warn("Could not convert audio URL to base64:", err);
    return null;
  }
}

function buildTranscriptionPrompt(isJournal: boolean, liveTranscript?: string): string {
  const basePrompt = isJournal
    ? `You are an expert personal reflection and journal chronicler. I am providing you with a personal voice recording/diary audio.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the human speech that is clearly audible in this audio.
- DO NOT invent, hallucinate, assume, or extrapolate words, reflections, or topics not directly spoken in the audio.
- If the audio is silent or contains no decipherable human speech, return:
  "summary": "No speech detected in this recording.",
  "transcript": ""
- If valid speech is present, provide:
  1. "summary": A beautifully written, reflective first-person journal entry in clean Markdown. Include structured sections:
     - "### Daily Reflection"
     - "### Key Insights & Lessons"
     - "### Notable Memories & Highlights"
     Do NOT use emojis anywhere.
  2. "transcript": A highly accurate, verbatim transcript of the spoken thoughts and reflections.

Return ONLY valid JSON matching this schema:
{
  "summary": "### Daily Reflection\\n...",
  "transcript": "..."
}`
    : `You are an expert executive meeting assistant. I am providing you with an audio recording of a meeting.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the actual human speech that is clearly audible in this audio recording.
- DO NOT invent, hallucinate, assume, or extrapolate dialogue, attendees, decisions, or topics not directly spoken in the audio.
- If the audio is silent or contains no decipherable human speech, return:
  "summary": "No speech detected in this recording.",
  "transcript": ""
- If valid speech is present, provide:
  1. "summary": A rich, professional executive meeting summary in Markdown. Include sections: "# Executive Summary", "## Key Decisions", and "## Action Items" (with checkbox checklist format "- [ ] Owner: Task"). Do NOT use emojis.
  2. "transcript": A highly accurate transcript. Label distinct speakers as "Speaker 1", "Speaker 2", etc.

Return ONLY valid JSON matching this schema:
{
  "summary": "# Executive Summary\\n...",
  "transcript": "Speaker 1: ...\\nSpeaker 2: ..."
}`;

  if (liveTranscript && liveTranscript.trim().length > 0) {
    return `${basePrompt}\n\nOPTIONAL REFERENCE (On-device transcript):\n"""\n${liveTranscript.trim()}\n"""\nUse the audio recording as primary truth. Reference this for proper nouns or names.`;
  }
  return basePrompt;
}

/**
 * Direct client-side call to Google's Gemini API when user has configured their API key in Settings.
 * Bypasses Vercel serverless body size limits (4.5 MB) and execution timeouts entirely.
 */
async function callGeminiDirect(
  apiKey: string,
  base64Audio: string,
  mimeType: string,
  isJournal: boolean,
  liveTranscript?: string
): Promise<{ transcript: string; summary: string }> {
  const models = ['gemini-3.8-flash'];
  const prompt = buildTranscriptionPrompt(isJournal, liveTranscript);
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Audio,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return parseGeminiResponse(candidateText);
        }
      } else {
        const errJson = await response.json().catch(() => null);
        const errMsg = errJson?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        console.warn(`Direct Gemini call failed on model ${model}:`, errMsg);
        lastError = new Error(errMsg);
      }
    } catch (e: any) {
      console.warn(`Direct Gemini network exception with ${model}:`, e);
      lastError = e;
    }
  }

  throw lastError || new Error('Google Gemini API request failed.');
}

/**
 * Universal Audio Transcription Engine:
 * 1. Resolves audio to Base64 in browser if needed (works for blob: URLs, R2, and Supabase).
 * 2. If client has custom Gemini API key in Settings, calls Google Gemini API directly (no Vercel timeout/body limits).
 * 3. Falls back to Next.js API route (/api/transcribe).
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

  const cleanMimeType = (params.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  
  // 1. Resolve audio URL & Base64
  const isBlobUrl = params.audioUrl?.startsWith('blob:');
  const safeAudioUrl = isBlobUrl ? undefined : params.audioUrl;
  let audioBase64 = params.audioBase64;
  
  const customKey = typeof window !== 'undefined' ? localStorage.getItem('cubnotes_gemini_api_key') : null;

  // Resolve base64 from blob if needed
  if (!audioBase64 && params.audioBlob) {
    try {
      audioBase64 = await convertBlobToBase64(params.audioBlob);
    } catch (err) {
      console.warn("Could not convert audioBlob to base64:", err);
    }
  }

  // If we have a custom key and no base64 yet, resolve from audioUrl (including blob: URLs)
  if (customKey && !audioBase64 && params.audioUrl && typeof window !== 'undefined') {
    audioBase64 = (await convertUrlToBase64(params.audioUrl)) || undefined;
  }

  // 2. Direct Call if user provided Gemini API Key in Settings (handles up to 20MB inline audio = ~1.5 hours of speech!)
  if (customKey && audioBase64 && audioBase64.length <= 28 * 1024 * 1024) {
    try {
      const directResult = await callGeminiDirect(
        customKey,
        audioBase64,
        cleanMimeType,
        Boolean(params.isJournal),
        params.liveTranscript
      );
      if (directResult.transcript || directResult.summary) {
        return {
          transcript: directResult.transcript || params.liveTranscript || '',
          summary: directResult.summary || '',
          source: 'direct',
        };
      }
    } catch (directErr: any) {
      console.warn("Direct Gemini transcription failed, falling back to server API with custom key:", directErr);
    }
  }

  // 3. Next.js API Route (/api/transcribe) Fallback
  // CRITICAL: When safeAudioUrl is available, NEVER include large audioBase64 in the request body!
  // Vercel serverless functions have a 4.5 MB request payload limit. Sending large base64 causes HTTP 413.
  // When safeAudioUrl is sent, payload is < 1 KB, and the server downloads and streams audio directly.
  try {
    const payloadBase64 = safeAudioUrl ? undefined : (audioBase64 && audioBase64.length < 3.5 * 1024 * 1024 ? audioBase64 : undefined);

    if (!safeAudioUrl && !payloadBase64) {
      // Audio is too large to send directly through Vercel serverless payload limit without cloud storage
      if (!customKey) {
        throw new Error("This recording is too long to process without cloud storage or an API key. Please add your Google Gemini API key in CubNotes Settings > AI to transcribe long recordings directly without limits.");
      }
    }

    const apiRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
      },
      body: JSON.stringify({
        audioBase64: payloadBase64,
        audioUrl: safeAudioUrl,
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
        throw new Error(data.error);
      }
    } else {
      const errJson = await apiRes.json().catch(() => null);
      const errMsg = errJson?.error || `HTTP ${apiRes.status}: ${apiRes.statusText}`;
      throw new Error(errMsg);
    }
  } catch (apiErr: any) {
    console.error("API route transcription error:", apiErr);

    const message = apiErr?.message || String(apiErr);
    if (message.includes('API key is not configured') || message.includes('API_KEY')) {
      throw new Error("Gemini API key is not configured. Please open CubNotes Settings > AI to verify your Google Gemini API key.");
    }
    if (message.includes('413') || message.includes('Payload Too Large')) {
      throw new Error("Recording is too large to send directly. Please ensure audio storage is connected or enter your Gemini API key in Settings.");
    }

    throw new Error(`AI Processing failed: ${message}`);
  }

  throw new Error('No transcription result returned.');
}
