import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { textNodes, audioSummaries } = body;

    const combinedInput = [
      ...textNodes.map((t: string) => `Text Note: ${t}`),
      ...audioSummaries.map((a: string) => `Meeting Summary: ${a}`)
    ].join('\n\n');

    const prompt = `
You are an expert executive assistant and note organizer. I have selected a disorganized cluster of notes from my whiteboard canvas.
Please synthesize, organize, and structure this chaos into a highly readable, professional document.

Here is the raw data:
${combinedInput}

Output your response ENTIRELY as raw HTML so it can be directly injected into a rich text editor (TipTap).
Use tags like <h1>, <h2>, <p>, <ul>, <li>, <strong>, <em>, and <table> if appropriate.
DO NOT wrap the HTML in markdown code blocks (e.g. \`\`\`html). Just output the raw HTML string directly.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
    });

    let html = response.text || "";
    // Clean up if Gemini accidentally includes markdown wrappers
    html = html.replace(/^```html/i, '').replace(/```$/i, '').trim();

    return NextResponse.json({ organizedHtml: html });

  } catch (error: any) {
    console.error("Organize Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
