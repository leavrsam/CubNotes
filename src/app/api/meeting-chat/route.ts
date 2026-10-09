import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      transcript = '', 
      summary = '', 
      notes = '', 
      question = '', 
      history = [], 
      apiKey: clientApiKey 
    } = body;

    if (!question.trim()) {
      return NextResponse.json({ error: "Question cannot be empty." }, { status: 400 });
    }

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured. Please set GEMINI_API_KEY or add your key in Settings." }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Build context
    const contextPrompt = `You are an intelligent, perceptive meeting co-pilot for CubNotes, designed to provide specific, exact answers about this meeting.

CONTEXT:
${summary ? `### Executive Summary:\n${summary}\n\n` : ''}
${notes ? `### User's Meeting Notes:\n${notes}\n\n` : ''}
### Full Meeting Transcript:
${transcript || "No transcript available yet. Please answer based on the summary or notes if available."}

INSTRUCTIONS:
1. Ground your answer strictly in the meeting transcript, summary, and notes provided above.
2. If the user asks about a specific person, quote what they said or summarize their exact stance.
3. If the user asks for action items, list them clearly with owners.
4. If the user asks to draft an email, message, or follow-up, write a polished, professional message ready to send.
5. If the answer cannot be determined from the transcript, politely state that it was not discussed during the recorded meeting.
6. Format your response in clean Markdown.`;

    const chatMessages: any[] = [
      { text: contextPrompt }
    ];

    // Add recent history (up to last 6 turns)
    const recentHistory = history.slice(-6);
    for (const h of recentHistory) {
      chatMessages.push({
        text: `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.text}`
      });
    }

    chatMessages.push({
      text: `User Question: ${question}\n\nAnswer:`
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: chatMessages,
      config: {
        temperature: 0.2,
      }
    });

    const answer = response.text || "I was unable to find an answer in the meeting transcript.";

    return NextResponse.json({
      success: true,
      answer: answer.trim(),
    });
  } catch (error: any) {
    console.error("Error in /api/meeting-chat:", error);
    return NextResponse.json({ error: error.message || "Failed to process question" }, { status: 500 });
  }
}
