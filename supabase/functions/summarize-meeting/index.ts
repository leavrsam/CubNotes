import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. JWT Authentication verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request body
    const { audioBase64, mimeType = 'audio/webm' } = await req.json();

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: 'Missing audioBase64' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Call Gemini API
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY is not set in Edge Function secrets.");
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    const model = ai.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });
    
    const result = await model.generateContent([
      "You are an expert AI meeting assistant. Transcribe the audio exactly as a 'transcript', and YOU MUST identify and separate different speakers (e.g., Speaker 1: ..., Speaker 2: ...). Then, summarize the meeting into key takeaways, action items, and decisions as 'summary' (formatted in clean, rich markdown). Return a JSON object with two string keys: 'summary' and 'transcript'.",
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType,
        }
      }
    ]);

    const responseText = result.response.text();
    let parsedData = { summary: "", transcript: "" };
    
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      console.warn("Failed to parse JSON, falling back to raw text", e);
      parsedData.summary = responseText;
      parsedData.transcript = "Transcript not available in requested format.";
    }

    return new Response(JSON.stringify({ 
      success: true, 
      summary: parsedData.summary,
      transcript: parsedData.transcript
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Function error:", error);
    
    // We return 200 so supabase-js parses the body instead of throwing a generic HttpError
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || String(error),
      stack: error.stack
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
