import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { id, content, type, metadata = {} } = await req.json();

    if (!id || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call Gemini for embedding
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: content,
    });

    const embedding = response.embeddings?.[0]?.values;

    if (!embedding) {
      throw new Error("Failed to generate embedding");
    }

    // Upsert into Supabase documents table
    const { error } = await supabase
      .from('documents')
      .upsert({
        id,
        user_id: user.id,
        content,
        metadata: { type, ...metadata },
        embedding
      }, {
        onConflict: 'id'
      });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sync Embedding Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
