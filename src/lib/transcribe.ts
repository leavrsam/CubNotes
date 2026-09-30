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
  source: 'direct' | 'api';
}

function parseGeminiResponse(rawText: string): { transcript: string; summary: string } {
  let cleanJson = rawText.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  try {
    const parsed = JSON.parse(cleanJson);
    return {
      transcript: parsed.transcript || '',
      summary: parsed.summary || cleanJson,
    };
  } catch {
    // Regex extraction fallback if JSON has minor syntax issues
    const transcriptMatch = cleanJson.match(/"transcript"\s*:\s*"([\s\S]*?)(?=",\s*"summary"|"})/);
    const summaryMatch = cleanJson.match(/"summary"\s*:\s*"([\s\S]*?)(?="})/);
    return {
      transcript: transcriptMatch ? transcriptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
      summary: summaryMatch ? summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : cleanJson,
    };
  }
}

async function convertUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const b64 = dataUrl.split(',')[1] || '';
        resolve(b64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
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
  "transcript": "",
  "summary": "No speech detected in this recording."
- If valid speech is present, provide:
  1. "transcript": A highly accurate, verbatim transcript of the spoken thoughts and reflections.
  2. "summary": A beautifully written, reflective first-person journal entry in clean Markdown. Include structured sections:
     - "### Daily Reflection"
     - "### Key Insights & Lessons"
     - "### Notable Memories & Highlights"
     Do NOT use emojis anywhere.

Return ONLY valid JSON matching this schema:
{
  "transcript": "...",
  "summary": "### Daily Reflection\\n..."
}`
    : `You are an expert executive meeting assistant. I am providing you with an audio recording of a meeting.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the actual human speech that is clearly audible in this audio recording.
- DO NOT invent, hallucinate, assume, or extrapolate dialogue, attendees, decisions, or topics not directly spoken in the audio.
- If the audio is silent or contains no decipherable human speech, return:
  "transcript": "",
  "summary": "No speech detected in this recording."
- If valid speech is present, provide:
  1. "transcript": A highly accurate transcript. Label distinct speakers as "Speaker 1", "Speaker 2", etc.
  2. "summary": A rich, professional meeting summary in Markdown. Include sections: "Executive Summary", "Key Decisions", and "Action Items". Do NOT use emojis.

Return ONLY valid JSON matching this schema:
{
  "transcript": "Speaker 1: ...\\nSpeaker 2: ...",
  "summary": "# Executive Summary\\n..."
}`;

  if (liveTranscript && liveTranscript.trim().length > 0) {
    return `${basePrompt}\n\nOPTIONAL REFERENCE (On-device transcript):\n"""\n${liveTranscript.trim()}\n"""\nUse the audio recording as primary truth. Reference this for proper nouns or names.`;
  }
  return basePrompt;
}

/**
 * Direct client-side call to Google's Gemini API when user has configured their API key in Settings.
 * Bypasses Vercel serverless body size limits (4.5 MB) and timeouts.
 */
async function callGeminiDirect(
  apiKey: string,
  base64Audio: string,
  mimeType: string,
  isJournal: boolean,
  liveTranscript?: string
): Promise<{ transcript: string; summary: string }> {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
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
  
  // 1. Resolve audio to Base64 if needed
  let audioBase64 = params.audioBase64;
  if (!audioBase64 && params.audioUrl && typeof window !== 'undefined') {
    audioBase64 = (await convertUrlToBase64(params.audioUrl)) || undefined;
  }

  const customKey = typeof window !== 'undefined' ? localStorage.getItem('cubnotes_gemini_api_key') : null;

  // 2. Direct Call if user provided Gemini API Key in Settings
  if (customKey && audioBase64) {
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
      console.warn("Direct Gemini transcription failed, attempting server API fallback:", directErr);
    }
  }

  // 3. Next.js API Route (/api/transcribe) Fallback
  try {
    const isBlobUrl = params.audioUrl?.startsWith('blob:');
    const safeAudioUrl = isBlobUrl ? undefined : params.audioUrl;

    const apiRes = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
      },
      body: JSON.stringify({
        audioBase64: audioBase64 || undefined,
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
      throw new Error("Gemini API key is not configured. Please open CubNotes Settings > AI to paste your free Google Gemini API key.");
    }
    if (message.includes('413') || message.includes('Payload Too Large')) {
      throw new Error("Audio recording is large. Please enter your free Gemini API key in Settings > AI so large audio can transcribe directly.");
    }

    throw new Error(`AI Processing failed: ${message}`);
  }

  throw new Error('No transcription result returned.');
}
