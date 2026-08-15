import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 60; // Allow Vercel functions to run up to 60 seconds for long transcripts

export async function POST(req: NextRequest) {
  try {
    const { audioUrl } = await req.json();

    if (!audioUrl) {
      return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // 1. Download the audio file from the public URL to a temp file
    // We need a physical file to use ai.files.upload()
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch audio file from URL');
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `${uuidv4()}.webm`);
    fs.writeFileSync(tempFilePath, buffer);

    // 2. Upload to Gemini File API
    const uploadResult = await ai.files.upload({
      file: tempFilePath,
    } as any);

    // 3. Generate Content using the uploaded file
    const prompt = `
      You are an expert executive assistant. I am providing you with an audio recording of a meeting.
      Please analyze this audio and provide a JSON response with two keys:
      1. "transcript": A highly accurate, speaker-diarized transcript of the meeting. Label the speakers as "Speaker 1", "Speaker 2", etc.
      2. "summary": A rich, formatted meeting summary in Markdown. Include sections like "Executive Summary", "Key Decisions", and "Action Items". Make it look professional and concise.

      Return ONLY valid JSON in the following format, with no markdown code blocks wrapping it:
      {
        "transcript": "Speaker 1: Hello everyone...\\nSpeaker 2: Hi there...",
        "summary": "# Executive Summary\\n..."
      }
    `;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        uploadResult,
        prompt
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const responseText = typeof result.text === 'function' ? result.text() : (result.text || '');
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse JSON", responseText);
      parsed = { transcript: "Failed to parse transcript", summary: "Failed to parse summary" };
    }

    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    // Clean up Gemini File
    if (uploadResult?.name) {
      await ai.files.delete({ name: uploadResult.name });
    }

    return NextResponse.json({
      transcript: parsed.transcript || "",
      summary: parsed.summary || ""
    });

  } catch (error: any) {
    console.error('Transcription error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
