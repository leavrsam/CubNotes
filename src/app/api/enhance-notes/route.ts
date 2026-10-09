import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { notes = '', transcript = '', meetingTitle = 'Meeting', apiKey: clientApiKey } = body;

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured. Please set GEMINI_API_KEY or add your key in Settings." }, { status: 500 });
    }

    if (!transcript && !notes) {
      return NextResponse.json({ error: "At least notes or transcript must be provided." }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an elite executive assistant and meeting note enhancer, inspired by Granola and Google AI Edge Foresight.
Your task is to take the user's raw shorthand meeting notes and ENRICH them using the verbatim meeting transcript.

CRITICAL INSTRUCTIONS:
1. RETAIN THE USER'S INTENT & VOICE: The user's bullet points represent what THEY cared about. Use their structure as the backbone.
2. ENRICH WITH SPECIFICS: For each bullet or topic the user noted, pull in exact details spoken in the transcript (names, numbers, percentages, dates, and quotes).
3. FILL IN MISSED DECISIONS: If critical decisions were made that the user didn't note, add a distinct section for "Additional Key Decisions".
4. EXTRACT ACTION ITEMS: Create an explicit "Action Items" checklist with checkboxes format "- [ ] Owner: Task (due date if mentioned)".
5. FORMATTING: Use clean, professional Markdown with clear headings (##, ###), bold text for emphasis, and bullet points. DO NOT use emojis.
6. GROUNDING: DO NOT hallucinate. Every detail added must be directly supported by the transcript.

Meeting Title: "${meetingTitle}"

User's Raw Shorthand Notes:
"""
${notes || "(No manual notes taken - please provide a structured synthesis based strictly on the transcript)"}
"""

Full Meeting Transcript:
"""
${transcript}
"""

Return the enriched notes directly in clean Markdown format:`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
      }
    });

    const enhancedNotes = response.text || "";

    return NextResponse.json({
      success: true,
      enhancedNotes: enhancedNotes.trim(),
    });
  } catch (error: any) {
    console.error("Error in /api/enhance-notes:", error);
    return NextResponse.json({ error: error.message || "Failed to enhance notes" }, { status: 500 });
  }
}
