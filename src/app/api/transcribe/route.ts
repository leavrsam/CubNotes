import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { formatGeminiErrorMessage } from '@/lib/geminiRetry';
import { normalizeGeminiAudioMimeType } from '@/lib/geminiMime';
import { DREWS_PITCH_AUDIO_ID, DREWS_PITCH_SUMMARY, DREWS_PITCH_TRANSCRIPT } from '@/lib/drewsPitchData';

export const maxDuration = 60; // Allow Vercel functions to run up to 60 seconds for long transcripts

export async function POST(req: NextRequest) {
  let uploadedGeminiFileName: string | null = null;
  let ai: GoogleGenAI | null = null;

  try {
    const contentType = req.headers.get('content-type') || '';
    let audioUrl = '';
    let audioBase64 = '';
    let rawMimeType = 'audio/webm';
    let isJournal = false;
    let liveTranscript = '';
    let clientApiKey = '';
    let fileBuffer: Buffer | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as Blob | File | null;
      audioUrl = (formData.get('audioUrl') as string) || '';
      rawMimeType = (formData.get('mimeType') as string) || file?.type || 'audio/webm';
      isJournal = formData.get('isJournal') === 'true';
      liveTranscript = (formData.get('liveTranscript') as string) || '';
      clientApiKey = (formData.get('apiKey') as string) || '';

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
      }
    } else {
      const body = await req.json();
      audioUrl = body.audioUrl || '';
      audioBase64 = body.audioBase64 || '';
      rawMimeType = body.mimeType || 'audio/webm';
      isJournal = Boolean(body.isJournal);
      liveTranscript = body.liveTranscript || '';
      clientApiKey = body.apiKey || '';
    }

    if (!audioUrl && !audioBase64 && !fileBuffer) {
      return NextResponse.json({ error: 'Audio file, audioBase64, or audioUrl is required.' }, { status: 400 });
    }

    // Fast path: Immediately return pre-computed transcript & summary for Drew's Pitch
    if (audioUrl && typeof audioUrl === 'string' && audioUrl.includes(DREWS_PITCH_AUDIO_ID)) {
      return NextResponse.json({
        success: true,
        transcript: DREWS_PITCH_TRANSCRIPT,
        summary: DREWS_PITCH_SUMMARY,
      });
    }

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in Vercel or add your key in Motif Settings.' 
      }, { status: 500 });
    }

    ai = new GoogleGenAI({ apiKey });

    // Clean and normalize MIME type for Gemini (handles .m4a, .mp4, .wav, .webm without unsupported parameters)
    const cleanMimeType = normalizeGeminiAudioMimeType(rawMimeType, audioUrl);

    // 1. Prepare Audio Part for Gemini
    let audioPart: any = null;

    if (fileBuffer && fileBuffer.length > 0) {
      if (fileBuffer.length <= 18 * 1024 * 1024) {
        audioPart = {
          inlineData: {
            mimeType: cleanMimeType,
            data: fileBuffer.toString('base64'),
          },
        };
      } else {
        const blob = new Blob([new Uint8Array(fileBuffer)], { type: cleanMimeType });
        const uploadResult = await ai.files.upload({
          file: blob,
          mimeType: cleanMimeType,
        } as any);
        uploadedGeminiFileName = uploadResult?.name || null;
        audioPart = uploadResult;
      }
    } else if (audioBase64 && typeof audioBase64 === 'string') {
      audioPart = {
        inlineData: {
          mimeType: cleanMimeType,
          data: audioBase64,
        },
      };
    } else if (audioUrl) {
      if (typeof audioUrl === 'string' && audioUrl.startsWith('blob:')) {
        return NextResponse.json({ error: 'Local blob URLs cannot be fetched on the server. Please provide audio file or audioBase64.' }, { status: 400 });
      }

      // Download audio file from storage URL with 25s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      let response: Response;
      try {
        response = await fetch(audioUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch audio file from storage (HTTP ${response.status}): ${response.statusText}`);
      }

      const storageContentType = response.headers.get('content-type');
      const resolvedMime = normalizeGeminiAudioMimeType(storageContentType || cleanMimeType, audioUrl);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length <= 18 * 1024 * 1024) {
        audioPart = {
          inlineData: {
            mimeType: resolvedMime,
            data: buffer.toString('base64'),
          },
        };
      } else {
        const blob = new Blob([buffer], { type: resolvedMime });
        const uploadResult = await ai.files.upload({
          file: blob,
          mimeType: resolvedMime,
        } as any);

        uploadedGeminiFileName = uploadResult?.name || null;
        audioPart = uploadResult;
      }
    }

    // 2. Strict Grounding, Topic Organization, and Anti-Hallucination Prompt
    const prompt = isJournal
      ? `You are an expert personal reflection and journal chronicler. I am providing you with a personal voice recording/diary audio.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the human speech that is clearly audible in this audio.
- DO NOT invent, hallucinate, assume, or extrapolate words, reflections, or topics not directly spoken in the audio.
- If the audio is silent, inaudible, mostly static/noise, or contains no decipherable human speech, you MUST return:
  "summary": "No speech detected in this recording.",
  "transcript": ""
- If valid speech is present, provide:
  1. "summary": A beautifully written, reflective first-person journal entry in clean Markdown. Include structured sections:
     - "### Daily Reflection" (cohesive narrative of thoughts shared)
     - "### Key Insights & Lessons" (notable takeaways or realizations)
     - "### Notable Memories & Highlights" (any specific events or details mentioned)
     Do NOT use emojis anywhere.
  2. "transcript": A highly accurate, verbatim transcript of the spoken thoughts and reflections. Divide into chronological topic sections with headers: "### [MM:SS] Topic Name".

Return ONLY valid JSON matching this schema:
{
  "summary": "### Daily Reflection\\n...",
  "transcript": "### [00:00] Morning Thoughts\\n..."
}`
      : `You are an expert executive meeting assistant. I am providing you with an audio recording of a meeting.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the actual human speech that is clearly audible in this audio recording.
- DO NOT invent, hallucinate, assume, or extrapolate dialogue, attendees, decisions, or topics not directly spoken in the audio.
- If the audio is silent, inaudible, mostly background static, or contains no decipherable human speech, you MUST return:
  "summary": "No speech detected in this recording.",
  "transcript": ""
- If valid speech is present, provide:
  1. "summary": A rich, comprehensive executive meeting summary in Markdown. Include sections:
     - "# Executive Summary" (high-level synopsis)
     - "## Key Topics Discussed" (bulleted list of all agenda topics covered)
     - "## Key Decisions" (numbered list of finalized decisions)
     - "## Action Items" (checkbox checklist in exact format: "- [ ] Owner: Task description")
     Do NOT use emojis anywhere.
  2. "transcript": A highly accurate verbatim transcript. Organize into distinct TOPICAL SECTIONS corresponding to the agenda using Markdown headings with timestamps:
     ### [MM:SS] Topic Title (e.g. "### [00:00] Meeting Kickoff & Goals", "### [02:30] Q3 Performance Review", "### [07:15] Action Items & Wrap-Up")
     Under each topic heading, provide verbatim dialogue labeled by speaker (e.g. "Speaker 1: ...\\nSpeaker 2: ...").

Return ONLY valid JSON matching this schema:
{
  "summary": "# Executive Summary\\n...",
  "transcript": "### [00:00] Meeting Kickoff\\nSpeaker 1: Hello everyone...\\n\\n### [03:15] Product Updates\\nSpeaker 2: Let's discuss..."
}`;

    const promptWithReference = (liveTranscript && typeof liveTranscript === 'string' && liveTranscript.trim().length > 0)
      ? `${prompt}\n\nOPTIONAL REFERENCE: Real-time on-device speech transcript captured during recording:\n"""\n${liveTranscript.trim()}\n"""\nUse the audio recording as your primary ground truth, but reference this to ensure accurate names, technical vocabulary, and verbatim coverage.`
      : prompt;

    // 3. Generate Content using Google's newest model gemini-3.8-flash (with retry for transient 503/429 demand spikes)
    let result: any = null;
    let lastGenError: any = null;
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            audioPart,
            { text: promptWithReference }
          ],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 8192,
          }
        });
        lastGenError = null;
        break;
      } catch (genErr: any) {
        lastGenError = genErr;
        const errMsg = String(genErr?.message || genErr);
        const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand') || errMsg.includes('overloaded');
        
        if (isTransient && attempt < maxAttempts) {
          const delayMs = attempt * 1500;
          console.warn(`[transcribe API] Gemini temporary load spike (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        if (isTransient) {
          return NextResponse.json({
            success: false,
            error: "Google Gemini is currently experiencing temporary high demand. Please try again in a few moments."
          }, { status: 503 });
        }

        throw genErr;
      }
    }

    const responseText: string = (result as any).text || '';
    
    // Clean potential markdown wrappers
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    let parsedSummary = '';
    let parsedTranscript = '';

    // 1. Direct standard JSON parsing
    try {
      const parsed = JSON.parse(cleanJson);
      parsedSummary = parsed.summary || '';
      parsedTranscript = parsed.transcript || '';
    } catch {
      // 2. Attempt repair for truncated JSON
      try {
        let repaired = cleanJson;
        if (!repaired.endsWith('"}') && !repaired.endsWith('}')) {
          if (repaired.endsWith('"')) {
            repaired += '}';
          } else {
            repaired += '"}';
          }
        }
        const parsed = JSON.parse(repaired);
        parsedSummary = parsed.summary || '';
        parsedTranscript = parsed.transcript || '';
      } catch {}

      // 3. Robust regex fallback
      if (!parsedSummary) {
        const summaryMatch = cleanJson.match(/"summary"\s*:\s*"([\s\S]*?)(?=(?:",\s*"transcript"|"(?:\s*})|$))/);
        if (summaryMatch) {
          parsedSummary = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        }
      }

      if (!parsedTranscript) {
        const transcriptMatch = cleanJson.match(/"transcript"\s*:\s*"([\s\S]*?)(?=(?:",\s*"summary"|"(?:\s*})|$))/);
        if (transcriptMatch) {
          parsedTranscript = transcriptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        } else {
          const partialMatch = cleanJson.match(/"transcript"\s*:\s*"([\s\S]*)$/);
          if (partialMatch) {
            parsedTranscript = partialMatch[1]
              .replace(/"\s*}?\s*$/, '')
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"');
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      transcript: parsedTranscript || "",
      summary: parsedSummary || (parsedTranscript ? "Summary completed." : (cleanJson.length > 0 ? cleanJson : "No speech detected in this recording."))
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    const friendlyError = formatGeminiErrorMessage(error, 'Failed to process audio recording.');

    return NextResponse.json({ 
      success: false, 
      error: friendlyError 
    }, { status: 500 });
  } finally {
    // Clean up uploaded Gemini File if created
    if (ai && uploadedGeminiFileName) {
      try {
        await ai.files.delete({ name: uploadedGeminiFileName });
      } catch {}
    }
  }
}
