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
    // 1. Optional JWT Authentication verification (fallback to anon key if present)
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      // Optional check, non-blocking if anon key invoked
      await supabase.auth.getUser().catch(() => ({ data: { user: null }, error: null }));
    }

    // 2. Parse request body
    const { audioBase64, audioUrl, mimeType = 'audio/webm', isJournal = false } = await req.json();

    let base64Data = audioBase64;
    const cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();

    // If audioUrl provided instead of audioBase64, fetch it
    if (!base64Data && audioUrl) {
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to download audio from url: ${audioRes.statusText}`);
      }
      const arrayBuffer = await audioRes.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8.byteLength; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      base64Data = btoa(binary);
    }

    if (!base64Data) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing audio data (audioBase64 or audioUrl required)' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Call Gemini API
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY is not set in Edge Function secrets.");
    }

    const ai = new GoogleGenerativeAI(geminiKey);
    const prompt = isJournal
      ? `You are an expert personal reflection and journal chronicler. I am providing you with a personal voice recording/diary audio.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the human speech that is clearly audible in this audio.
- DO NOT invent, hallucinate, assume, or extrapolate words, reflections, or topics not directly spoken in the audio.
- If the audio is silent, inaudible, mostly static/noise, or contains no decipherable human speech, you MUST return:
  "transcript": "",
  "summary": "No speech detected in this recording."
- If valid speech is present, return:
  1. "transcript": A highly accurate transcript of the spoken thoughts and reflections.
  2. "summary": A beautifully written first-person journal entry in clean Markdown with structured sections:
     - "### Daily Reflection"
     - "### Key Insights & Lessons"
     - "### Notable Memories & Highlights"
     Do NOT use emojis anywhere.

Return ONLY valid JSON matching this format:
{
  "transcript": "...",
  "summary": "### Daily Reflection\\n..."
}`
      : `You are an expert executive meeting assistant. I am providing you with an audio recording of a meeting.

CRITICAL ACCURACY & GROUNDING INSTRUCTIONS:
- Transcribe ONLY the actual human speech that is clearly audible in this audio recording.
- DO NOT invent, hallucinate, assume, or extrapolate dialogue, attendees, decisions, or topics not directly spoken in the audio.
- If the audio is silent, inaudible, mostly background static, or contains no decipherable human speech, you MUST return:
  "transcript": "",
  "summary": "No speech detected in this recording."
- If valid speech is present, return:
  1. "transcript": A highly accurate transcript. Label distinct speakers as "Speaker 1", "Speaker 2", etc.
  2. "summary": A rich, professional meeting summary in Markdown with sections: "Executive Summary", "Key Decisions", and "Action Items". Do NOT use emojis.

Return ONLY valid JSON matching this format:
{
  "transcript": "Speaker 1: ...\\nSpeaker 2: ...",
  "summary": "# Executive Summary\\n..."
}`;

    const model = ai.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1, // Prevent hallucinations
      }
    });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: cleanMimeType,
        }
      }
    ]);

    const responseText = result.response.text();
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    let parsedData = { summary: "", transcript: "" };
    try {
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.warn("Failed to parse JSON, extracting via regex:", e);
      const transcriptMatch = cleanJson.match(/"transcript"\s*:\s*"([\s\S]*?)(?=",\s*"summary"|"})/);
      const summaryMatch = cleanJson.match(/"summary"\s*:\s*"([\s\S]*?)(?="})/);
      parsedData = {
        transcript: transcriptMatch ? transcriptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
        summary: summaryMatch ? summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : cleanJson,
      };
    }

    return new Response(JSON.stringify({ 
      success: true, 
      summary: parsedData.summary || "No speech detected in this recording.",
      transcript: parsedData.transcript || ""
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Function error:", error);
    
    // Return 200 with success: false so supabase client parses JSON error
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || String(error),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
