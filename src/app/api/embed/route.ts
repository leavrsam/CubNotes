import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
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
