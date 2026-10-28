import { DREWS_PITCH_AUDIO_ID, DREWS_PITCH_SUMMARY, DREWS_PITCH_TRANSCRIPT } from './drewsPitchData';
import { formatGeminiErrorMessage } from './geminiRetry';
import { normalizeGeminiAudioMimeType } from './geminiMime';

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
  2. "transcript": A highly accurate, verbatim transcript of the spoken thoughts and reflections. Divide into chronological topic sections with headers: "### [MM:SS] Topic Name".

Return ONLY valid JSON matching this schema:
{
  "summary": "### Daily Reflection\\n...",
  "transcript": "### [00:00] Morning Reflection\\n..."
}`
    : `You are an expert executive meeting assistant. I am providing you with an audio recording of a meeting.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the actual human speech that is clearly audible in this audio recording.
- DO NOT invent, hallucinate, assume, or extrapolate dialogue, attendees, decisions, or topics not directly spoken in the audio.
- If the audio is silent or contains no decipherable human speech, return:
  "summary": "No speech detected in this recording.",
  "transcript": ""
- If valid speech is present, provide:
  1. "summary": A rich, professional executive meeting summary in Markdown. Include sections:
     - "# Executive Summary"
     - "## Key Topics Discussed"
     - "## Key Decisions"
     - "## Action Items" (checkbox checklist: "- [ ] Owner: Task")
     Do NOT use emojis anywhere.
  2. "transcript": A highly accurate transcript. Organize into distinct TOPICAL SECTIONS corresponding to the agenda using Markdown headings with timestamps:
     ### [MM:SS] Topic Title (e.g. "### [00:00] Meeting Kickoff & Goals", "### [02:30] Q3 Performance Review", "### [07:15] Action Items & Wrap-Up")
     Under each topic heading, provide verbatim dialogue labeled by speaker (e.g. "Speaker 1: ...\\nSpeaker 2: ...").

Return ONLY valid JSON matching this schema:
{
  "summary": "# Executive Summary\\n...",
  "transcript": "### [00:00] Meeting Kickoff\\nSpeaker 1: ...\\n\\n### [03:15] Updates\\nSpeaker 2: ..."
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
  liveTranscript?: string,
  maxRetries = 3
): Promise<{ transcript: string; summary: string }> {
  const model = 'gemini-3.8-flash';
  const prompt = buildTranscriptionPrompt(isJournal, liveTranscript);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      }

      const errJson = await response.json().catch(() => null);
      const statusCode = response.status;
      const errMsg = errJson?.error?.message || `HTTP ${statusCode}: ${response.statusText}`;
      const isTransient = statusCode === 503 || statusCode === 429 || statusCode === 500 || errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('unavailable');

      if (isTransient && attempt < maxRetries) {
        const delayMs = attempt * 1500;
        console.warn(`[Direct Gemini] Model load spike ${statusCode} (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      lastError = isTransient 
        ? new Error("Google Gemini is currently experiencing temporary high demand. Please try again in a few moments.")
        : new Error(errMsg);
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('unavailable');
      if (isTransient && attempt < maxRetries) {
        const delayMs = attempt * 1500;
        console.warn(`[Direct Gemini] Transient exception (attempt ${attempt}/${maxRetries}). Retrying in ${delayMs}ms...`);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }
      lastError = isTransient
        ? new Error("Google Gemini is currently experiencing temporary high demand. Please try again in a few moments.")
        : e;
    }
  }

  throw lastError || new Error('Google Gemini API request failed.');
}

/**
 * Universal Audio Transcription Engine:
 * 1. Automatically normalizes audio MIME types (e.g. Android AAC/MP4 vs WebM vs WAV).
 * 2. If client has custom Gemini API key in Settings, calls Google Gemini API directly (no Vercel limits).
 * 3. Falls back to Next.js API route (/api/transcribe) supporting both multipart FormData and JSON.
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

  const cleanMimeType = normalizeGeminiAudioMimeType(params.mimeType, params.audioUrl);
  
  // 1. Resolve audio URL & Base64
  const isBlobUrl = Boolean(params.audioUrl?.startsWith('blob:'));
  const safeAudioUrl = isBlobUrl ? undefined : params.audioUrl;
  let audioBase64 = params.audioBase64;
  
  const customKey = typeof window !== 'undefined' ? (localStorage.getItem('motif_gemini_api_key') || localStorage.getItem('cubnotes_gemini_api_key')) : null;

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
  try {
    let apiRes: Response;

    // PREFER MULTIPART FORMDATA when audioBlob is available (avoids 33% base64 overhead!)
    if (params.audioBlob && params.audioBlob.size <= 4.5 * 1024 * 1024) {
      const formData = new FormData();
      formData.append('file', params.audioBlob, `audio_${Date.now()}.${cleanMimeType.includes('mp4') ? 'm4a' : 'webm'}`);
      if (safeAudioUrl) formData.append('audioUrl', safeAudioUrl);
      formData.append('mimeType', cleanMimeType);
      formData.append('isJournal', String(Boolean(params.isJournal)));
      if (params.liveTranscript) formData.append('liveTranscript', params.liveTranscript);
      if (customKey) formData.append('apiKey', customKey);

      apiRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
        },
        body: formData,
      });
    } else {
      // JSON payload fallback
      const payloadBase64 = (audioBase64 && audioBase64.length < 3.8 * 1024 * 1024) ? audioBase64 : undefined;

      if (!safeAudioUrl && !payloadBase64 && !audioBase64) {
        if (!customKey) {
          throw new Error("No audio data was captured. Please check microphone permissions and try again.");
        }
      }

      apiRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
        },
        body: JSON.stringify({
          audioBase64: payloadBase64 || audioBase64,
          audioUrl: payloadBase64 ? undefined : safeAudioUrl,
          mimeType: cleanMimeType,
          isJournal: Boolean(params.isJournal),
          liveTranscript: params.liveTranscript,
          apiKey: customKey || undefined,
        }),
      });
    }

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

      // AUTOMATIC RESCUE FALLBACK (Granola-style on-device rescue):
      // If serverless audio transcription timed out (504) or failed, but real-time on-device speech was captured:
      if (params.liveTranscript && params.liveTranscript.trim().length > 30) {
        console.warn(`[transcribe] Serverless audio route returned ${apiRes.status}. Automatically rescuing meeting using captured on-device speech transcript...`);
        const fallbackRes = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
          },
          body: JSON.stringify({
            liveTranscript: params.liveTranscript,
            isJournal: Boolean(params.isJournal),
            apiKey: customKey || undefined,
          }),
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.success) {
            return {
              transcript: fallbackData.transcript || params.liveTranscript,
              summary: fallbackData.summary || 'Summary generated from live on-device transcript.',
              source: 'api',
            };
          }
        }
      }

      throw new Error(errMsg);
    }
  } catch (apiErr: any) {
    console.error("API route transcription error:", apiErr);

    // AUTOMATIC RESCUE FALLBACK on network or timeout exceptions:
    if (params.liveTranscript && params.liveTranscript.trim().length > 30) {
      console.warn("[transcribe] Network exception during audio processing. Rescuing meeting using captured on-device transcript...");
      try {
        const fallbackRes = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
          },
          body: JSON.stringify({
            liveTranscript: params.liveTranscript,
            isJournal: Boolean(params.isJournal),
            apiKey: customKey || undefined,
          }),
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.success) {
            return {
              transcript: fallbackData.transcript || params.liveTranscript,
              summary: fallbackData.summary || 'Summary generated from live on-device transcript.',
              source: 'api',
            };
          }
        }
      } catch (rescueErr) {
        console.warn("Rescue transcript fallback also failed:", rescueErr);
      }
    }

    const message = apiErr?.message || String(apiErr);
    if (message.includes('API key is not configured') || message.includes('API_KEY')) {
      throw new Error("Gemini API key is not configured. Please open Motif Settings > AI to verify your Google Gemini API key.");
    }
    if (message.includes('413') || message.includes('Payload Too Large')) {
      throw new Error("Recording is too large to send directly. Please ensure audio storage is connected or enter your Gemini API key in Settings.");
    }
    if (message.includes('504') || message.includes('Gateway Timeout')) {
      throw new Error("The recording took longer than expected to process on the server (HTTP 504 Gateway Timeout). Please add your Google Gemini API key in Motif Settings > AI to transcribe recordings directly without server limits.");
    }
    if (message.includes('503') || message.includes('high demand') || message.includes('UNAVAILABLE')) {
      throw new Error("Google Gemini is currently experiencing a temporary demand spike. Please try again in a few moments.");
    }

    throw new Error(formatGeminiErrorMessage(message, "AI Processing failed. Please try again."));
  }

  throw new Error('No transcription result returned.');
}
