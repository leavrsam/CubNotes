import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

import { DREWS_PITCH_AUDIO_ID, DREWS_PITCH_SUMMARY, DREWS_PITCH_TRANSCRIPT } from '@/lib/drewsPitchData';

export const maxDuration = 60; // Allow Vercel functions to run up to 60 seconds for long transcripts

export async function POST(req: NextRequest) {
  let uploadedGeminiFileName: string | null = null;
  let ai: GoogleGenAI | null = null;

  try {
    const body = await req.json();
    const { audioUrl, audioBase64, mimeType = 'audio/webm', isJournal = false, liveTranscript, apiKey: clientApiKey } = body;

    if (!audioUrl && !audioBase64) {
      return NextResponse.json({ error: 'Either audioUrl or audioBase64 is required.' }, { status: 400 });
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
        error: 'Gemini API key is not configured. Please set GEMINI_API_KEY in Vercel or add your key in CubNotes Settings.' 
      }, { status: 500 });
    }

    ai = new GoogleGenAI({ apiKey });

    // Clean MIME type (remove codecs parameter for Gemini)
    const cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();

    // 1. Prepare Audio Part for Gemini
    let audioPart: any = null;

    if (audioBase64 && typeof audioBase64 === 'string') {
      // Direct base64 inline audio (fastest, no disk I/O, no network latency)
      audioPart = {
        inlineData: {
          mimeType: cleanMimeType,
          data: audioBase64,
        },
      };
    } else if (audioUrl) {
      if (typeof audioUrl === 'string' && audioUrl.startsWith('blob:')) {
        return NextResponse.json({ error: 'Local blob URLs cannot be fetched on the server. Please provide audioBase64.' }, { status: 400 });
      }
      // Download audio file from storage URL
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio file from storage: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Inline data limit is 20MB in Gemini
      if (buffer.length <= 15 * 1024 * 1024) {
        audioPart = {
          inlineData: {
            mimeType: cleanMimeType,
            data: buffer.toString('base64'),
          },
        };
      } else {
        // For very large recordings (> 15MB), upload in-memory Blob to Gemini Files API
        const blob = new Blob([buffer], { type: cleanMimeType });
        const uploadResult = await ai.files.upload({
          file: blob,
          mimeType: cleanMimeType,
        } as any);

        uploadedGeminiFileName = uploadResult?.name || null;
        audioPart = uploadResult;
      }
    }

    // 2. Strict Grounding and Anti-Hallucination Prompt
    const prompt = isJournal
      ? `You are an expert personal reflection and journal chronicler. I am providing you with a personal voice recording/diary audio.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the human speech that is clearly audible in this audio.
- DO NOT invent, hallucinate, assume, or extrapolate words, reflections, or topics not directly spoken in the audio.
- DO NOT pull in phrases, stories, or content from outside sources, podcasts, videos, or templates.
- If the audio is silent, inaudible, mostly static/noise, or contains no decipherable human speech, you MUST return:
  "transcript": "",
  "summary": "No speech detected in this recording."
- If valid speech is present, provide:
  1. "transcript": A highly accurate, verbatim transcript of the spoken thoughts and reflections.
  2. "summary": A beautifully written, reflective first-person journal entry in clean Markdown. Include structured sections:
     - "### Daily Reflection" (cohesive narrative of thoughts shared)
     - "### Key Insights & Lessons" (notable takeaways or realizations)
     - "### Notable Memories & Highlights" (any specific events or details mentioned)
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
- DO NOT pull in phrases, meetings, or transcripts from external training data, YouTube, or generic templates.
- If the audio is silent, inaudible, mostly background static, or contains no decipherable human speech, you MUST return:
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

    const promptWithReference = (liveTranscript && typeof liveTranscript === 'string' && liveTranscript.trim().length > 0)
      ? `${prompt}\n\nOPTIONAL REFERENCE: Real-time on-device speech transcript captured during recording:\n"""\n${liveTranscript.trim()}\n"""\nUse the audio recording as your primary ground truth, but reference this to ensure accurate names, technical vocabulary, and verbatim coverage.`
      : prompt;

    // 3. Generate Content with multi-model failover (gemini-3.8-flash -> gemini-2.5-flash -> gemini-2.0-flash)
    let result: any;
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
        }
      });
    } catch (primaryErr: any) {
      console.warn("gemini-3.8-flash error, falling back to gemini-2.5-flash:", primaryErr?.message);
      try {
        result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            audioPart,
            { text: prompt }
          ],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          }
        });
      } catch (secondaryErr: any) {
        console.warn("gemini-2.5-flash error, falling back to gemini-2.0-flash:", secondaryErr?.message);
        result = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [
            audioPart,
            { text: prompt }
          ],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          }
        });
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

    let parsed: { transcript?: string; summary?: string } = {};
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.warn("Failed to parse Gemini JSON response directly, extracting fields:", responseText);
      const transcriptMatch = cleanJson.match(/"transcript"\s*:\s*"([\s\S]*?)(?=",\s*"summary"|"})/);
      const summaryMatch = cleanJson.match(/"summary"\s*:\s*"([\s\S]*?)(?="})/);
      parsed = {
        transcript: transcriptMatch ? transcriptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
        summary: summaryMatch ? summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : cleanJson,
      };
    }

    return NextResponse.json({
      success: true,
      transcript: parsed.transcript || "",
      summary: parsed.summary || (parsed.transcript ? "Summary could not be generated." : "No speech detected in this recording.")
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Failed to process audio recording.' 
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
