import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { transcript, question, history } = await req.json();

    if (!transcript) {
      throw new Error("Missing transcript in request");
    }
    
    if (!question) {
      throw new Error("Missing question in request");
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY is not set in Edge Function secrets.");
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    
    let result;
    
    const formattedHistory = (history || []).map((msg: any) => {
        return `[${msg.role === 'user' ? 'User' : 'Assistant'}]: ${msg.text}`;
    }).join('\n');
    
    const prompt = `You are an expert AI meeting assistant. Your task is to answer the user's question based ONLY on the provided meeting transcript.
    
1. Be concise, direct, and helpful.
2. DO NOT hallucinate. If the answer is not in the transcript, politely state that it was not discussed.
3. You can reference previous chat history if provided.

Meeting Transcript:
"""
${transcript}
"""

Previous Chat History:
"""
${formattedHistory}
"""

User Question:
"""
${question}
"""

Return your answer directly without any conversational filler or preambles.`;

    try {
      const model = ai.getGenerativeModel({ model: "gemini-3.5-flash" });
      result = await model.generateContent(prompt);
    } catch (e) {
      console.warn("Primary model gemini-3.5-flash failed, falling back to gemini-1.5-flash...", e);
      const fallbackModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      result = await fallbackModel.generateContent(prompt);
    }

    const responseText = result.response.text();

    return new Response(JSON.stringify({ 
      success: true, 
      answer: responseText
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Function error:", error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || String(error),
    }), {
      status: 200, // Return 200 so supabase client parses JSON error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
