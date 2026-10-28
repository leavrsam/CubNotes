import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { callGeminiWithRetry, formatGeminiErrorMessage, isTransientGeminiError } from '@/lib/geminiRetry';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      topic = "", 
      context = "",
      count = 4,
      apiKey: clientApiKey 
    } = body;

    if (!topic || !topic.trim()) {
      return NextResponse.json({ error: "Topic is required for mind map expansion." }, { status: 400 });
    }

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY or configure it in Motif Settings." 
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `
You are a brilliant brainstorming assistant and mind map designer.
When given a central topic or concept, your job is to generate ${count} distinct, concise, high-impact subtopics or sub-branches.

GUIDELINES:
1. Each subtopic must be succinct (2 to 6 words).
2. Avoid generic filler. Provide actionable, insightful, or complementary aspects of the core idea.
3. Return strictly a raw JSON object with the format:
{
  "subtopics": [
    "Subtopic 1",
    "Subtopic 2",
    "Subtopic 3",
    "Subtopic 4"
  ]
}

DO NOT wrap in markdown fences (\`\`\`json). Return strictly valid raw JSON.
`;

    const userPrompt = `Topic to expand into child mind map branches:\n"${topic.trim()}"\n${context ? `\nPage Context:\n${context}` : ''}`;

    const response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          systemPrompt,
          userPrompt
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      }),
      { maxAttempts: 3, initialDelayMs: 1200, label: 'expand-mindmap' }
    );

    let rawText = response.text || "";
    rawText = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    let parsed: { subtopics: string[] };
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse mind map JSON:", rawText);
      return NextResponse.json({ error: "Failed to parse mind map subtopics." }, { status: 500 });
    }

    const subtopics = Array.isArray(parsed?.subtopics) 
      ? parsed.subtopics.map((s: any) => String(s).trim()).filter(Boolean)
      : [];

    return NextResponse.json({ subtopics });

  } catch (error: any) {
    console.error("Expand Mind Map Error:", error);
    const friendlyMessage = formatGeminiErrorMessage(error, "Failed to expand mind map branch");
    const isTransient = isTransientGeminiError(error);
    return NextResponse.json({ error: friendlyMessage }, { status: isTransient ? 503 : 500 });
  }
}
