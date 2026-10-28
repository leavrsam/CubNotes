import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { callGeminiWithRetry, formatGeminiErrorMessage, isTransientGeminiError } from '@/lib/geminiRetry';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      notes = '', 
      transcript = '', 
      meetingTitle = 'Meeting', 
      template = 'standard',
      apiKey: clientApiKey 
    } = body;

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key is not configured. Please set GEMINI_API_KEY or add your key in Settings." }, { status: 500 });
    }

    if (!transcript && !notes) {
      return NextResponse.json({ error: "At least notes or transcript must be provided." }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });

    let templateInstructions = "";
    if (template === 'one_on_one') {
      templateInstructions = `
TARGET STRUCTURE (1-on-1 Catch-up):
- "## Context & Role Check-in": Personal alignment, state of mind, relationship context.
- "## Current Priorities & Progress": Key initiatives discussed and recent wins.
- "## Challenges & Feedback": Blockers, growth feedback, or support requested.
- "## Next Commitments": Specific mutual commitments with "- [ ] Owner: Task".`;
    } else if (template === 'technical') {
      templateInstructions = `
TARGET STRUCTURE (Technical / Architecture Spec):
- "## Architectural Decisions": Core technical decisions finalized, with rationale.
- "## System Design & Schema Changes": API, database, or protocol changes discussed.
- "## Trade-offs & Alternatives Considered": Rejected alternatives and identified risks.
- "## Implementation Tasks & Blockers": Concrete engineering tasks with "- [ ] Owner: Task".`;
    } else if (template === 'client') {
      templateInstructions = `
TARGET STRUCTURE (Client / Sales Discovery):
- "## Client Goals & Pain Points": The client's core problems, desired outcomes, and requirements.
- "## Scope, Budget & Timing": Agreed bounds, estimates, or schedule considerations.
- "## Questions & Objections": Key inquiries raised by the client and answers provided.
- "## Action Items & Deliverables": Follow-ups with "- [ ] Owner: Deliverable".`;
    } else {
      templateInstructions = `
TARGET STRUCTURE (Executive Summary):
- "## Executive Summary": Concise high-level synopsis.
- "## Discussion Highlights": Fleshed out from the user's notes and transcript.
- "## Key Decisions": Explicit list of decisions made.
- "## Action Items": Checkbox list format "- [ ] Owner: Task (deadline if mentioned)".`;
    }

    const prompt = `You are an elite executive assistant and meeting note enhancer.
Your task is to take the user's raw shorthand meeting notes and ENRICH them using the verbatim meeting transcript.

CRITICAL INSTRUCTIONS:
1. RETAIN THE USER'S INTENT & VOICE: The user's bullet points represent what THEY cared about. Use their structure as the backbone.
2. ENRICH WITH SPECIFICS: For each bullet or topic the user noted, pull in exact details spoken in the transcript (names, numbers, percentages, dates, and quotes).
3. FILL IN MISSED DECISIONS: If critical decisions were made that the user didn't note, add a distinct section for "Additional Key Decisions".
4. EXTRACT ACTION ITEMS: Create an explicit "Action Items" checklist with checkboxes format "- [ ] Owner: Task (due date if mentioned)".
5. FORMATTING: Use clean, professional Markdown with clear headings (##, ###), bold text for emphasis, and bullet points. DO NOT use emojis.
6. GROUNDING: DO NOT hallucinate. Every detail added must be directly supported by the transcript.
${templateInstructions}

Meeting Title: "${meetingTitle}"

User's Raw Shorthand Notes:
"""
${notes || "(No manual notes taken - please provide a structured synthesis based strictly on the transcript)"}
"""

Full Meeting Transcript:
"""
${transcript}
"""

Return the enriched notes directly in clean Markdown format:`;

    const response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          temperature: 0.2,
        }
      }),
      { maxAttempts: 4, initialDelayMs: 1500, label: 'enhance-notes' }
    );

    const enhancedNotes = response.text || "";

    return NextResponse.json({
      success: true,
      enhancedNotes: enhancedNotes.trim(),
    });
  } catch (error: any) {
    console.error("Error in /api/enhance-notes:", error);
    const friendlyMessage = formatGeminiErrorMessage(error, "Failed to enhance notes");
    const isTransient = isTransientGeminiError(error);
    return NextResponse.json({ error: friendlyMessage }, { status: isTransient ? 503 : 500 });
  }
}

