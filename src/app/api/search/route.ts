import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Embed the search query
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: query,
    });

    const query_embedding = response.embeddings?.[0]?.values;

    if (!query_embedding) {
      throw new Error("Failed to generate query embedding");
    }

    // Call the match_documents RPC function
    const { data: matches, error } = await supabase.rpc('match_documents', {
      query_embedding,
      match_threshold: 0.5,
      match_count: 10
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ matches });
  } catch (error: any) {
    console.error("Search Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
