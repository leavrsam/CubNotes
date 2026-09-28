import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
    });

    return NextResponse.json({ embedding: response.embeddings?.[0]?.values });
  } catch (error: any) {
    console.error("Embed Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
