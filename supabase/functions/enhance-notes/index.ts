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
    const { transcript, notes } = await req.json();

    if (!transcript) {
      throw new Error("Missing transcript in request");
    }
    
    if (!notes) {
      throw new Error("Missing notes in request");
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY is not set in Edge Function secrets.");
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    
    let result;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-3.5-flash" });
      const prompt = `You are an expert AI meeting assistant. Your task is to enhance the user's manual notes using the provided meeting transcript as context.
      
1. Expand on the user's shorthand notes, filling in missing details and context from the transcript.
2. Correct any factual inaccuracies in the notes based on the transcript.
3. Organize the notes beautifully with clear headings, bullet points, and action items.
4. DO NOT hallucinate. Only add information that is present in the transcript.
5. Retain the core intent and structure of the user's original notes.

Original Notes:
"""
${notes}
"""

Meeting Transcript:
"""
${transcript}
"""

Return the enhanced notes formatted in clean markdown.`;

      result = await model.generateContent(prompt);
    } catch (e) {
      console.warn("Primary model gemini-3.5-flash failed, falling back to gemini-1.5-flash...", e);
      const fallbackModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `You are an expert AI meeting assistant. Your task is to enhance the user's manual notes using the provided meeting transcript as context.
      
1. Expand on the user's shorthand notes, filling in missing details and context from the transcript.
2. Correct any factual inaccuracies in the notes based on the transcript.
3. Organize the notes beautifully with clear headings, bullet points, and action items.
4. DO NOT hallucinate. Only add information that is present in the transcript.
5. Retain the core intent and structure of the user's original notes.

Original Notes:
"""
${notes}
"""

Meeting Transcript:
"""
${transcript}
"""

Return the enhanced notes formatted in clean markdown.`;
      result = await fallbackModel.generateContent(prompt);
    }

    const responseText = result.response.text();

    return new Response(JSON.stringify({ 
      success: true, 
      enhancedNotes: responseText
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
