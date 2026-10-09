import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { textNodes = [], audioSummaries = [], imageNodes = [], apiKey: clientApiKey } = body;
    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured. Please set GEMINI_API_KEY in Vercel or add your key in CubNotes Settings." }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    const combinedInput = [
      ...textNodes.map((t: string) => `Text Note: ${t}`),
      ...audioSummaries.map((a: string) => `Meeting Summary: ${a}`)
    ].join('\n\n');

    const promptText = `
You are an expert executive assistant and note organizer. I have selected a disorganized cluster of notes, audio transcripts, and potentially handwritten sketches from my whiteboard canvas.
Please transcribe any handwritten notes, synthesize them with the text and audio, organize, and structure this chaos into a highly readable, professional document.

Here is the raw text/audio data:
${combinedInput}

Output your response ENTIRELY as raw HTML so it can be directly injected into a rich text editor (TipTap).
Use tags like <h1>, <h2>, <p>, <ul>, <li>, <strong>, <em>, and <table> if appropriate.
DO NOT wrap the HTML in markdown code blocks (e.g. \`\`\`html). Just output the raw HTML string directly.
`;

    const contents: any[] = [promptText];

    for (const imgUrl of imageNodes) {
      const base64Data = imgUrl.replace(/^data:image\/\w+;base64,/, '');
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: base64Data
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
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
