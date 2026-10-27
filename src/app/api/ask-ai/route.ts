import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { callGeminiWithRetry, formatGeminiErrorMessage, isTransientGeminiError } from '@/lib/geminiRetry';

export const maxDuration = 60;

interface AskAISource {
  pageId: string;
  pageTitle: string;
  notebookTitle: string;
  sectionTitle: string;
  snippet?: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      question = '', 
      history = [], 
      notebookFilter = null,
      clientNotebooks = null,
      apiKey: clientApiKey 
    } = body;

    if (!question.trim()) {
      return NextResponse.json({ error: "Question cannot be empty." }, { status: 400 });
    }

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY or configure your key in Settings." 
      }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // 1. Fetch user's notebooks, sections, and pages
    let notebooks: any[] = [];

    if (user) {
      const [nbRes, secRes, pRes] = await Promise.all([
        supabase.from('notebooks').select('id, title, is_journal, created_at').is('deleted_at', null).order('created_at', { ascending: true }),
        supabase.from('sections').select('id, notebook_id, title, sort_order').is('deleted_at', null).order('sort_order', { ascending: true }),
        supabase.from('pages').select('id, section_id, title, date, is_journal_entry, created_at, document_state').is('deleted_at', null).order('created_at', { ascending: true })
      ]);

      const rawNotebooks = nbRes.data || [];
      const rawSections = secRes.data || [];
      const rawPages = pRes.data || [];

      // Assemble hierarchy
      notebooks = rawNotebooks.map(nb => {
        const nbSections = rawSections
          .filter(s => s.notebook_id === nb.id)
          .map(sec => {
            const secPages = rawPages.filter(p => p.section_id === sec.id);
            return {
              ...sec,
              pages: secPages
            };
          });
        return {
          ...nb,
          sections: nbSections
        };
      });
    }

    // Merge or fallback to client-provided notebooks if user is working offline or has optimistic in-memory notes
    if (clientNotebooks && Array.isArray(clientNotebooks) && clientNotebooks.length > 0) {
      if (notebooks.length === 0) {
        notebooks = clientNotebooks;
      } else {
        // Merge any client notebook/page not yet in server list
        for (const cNb of clientNotebooks) {
          const existingNb = notebooks.find(n => n.id === cNb.id);
          if (!existingNb) {
            notebooks.push(cNb);
          } else {
            for (const cSec of cNb.sections || []) {
              const existingSec = (existingNb.sections || []).find((s: any) => s.id === cSec.id);
              if (!existingSec) {
                existingNb.sections = existingNb.sections || [];
                existingNb.sections.push(cSec);
              } else {
                for (const cP of cSec.pages || []) {
                  if (!(existingSec.pages || []).some((p: any) => p.id === cP.id)) {
                    existingSec.pages = existingSec.pages || [];
                    existingSec.pages.push(cP);
                  }
                }
              }
            }
          }
        }
      }
    }

    // 2. Filter notebooks if notebookFilter is specified
    let filteredNotebooks = notebooks;
    if (notebookFilter) {
      filteredNotebooks = notebooks.filter(nb => 
        nb.id === notebookFilter || 
        nb.title?.toLowerCase() === notebookFilter.toLowerCase()
      );
      if (filteredNotebooks.length === 0) {
        filteredNotebooks = notebooks; // fallback if filter didn't match
      }
    }

    // 3. Compile clean, rich knowledge index for Gemini
    const indexLines: string[] = [];
    indexLines.push("# MOTIF USER WORKSPACE KNOWLEDGE BASE");
    indexLines.push(`Total Notebooks: ${filteredNotebooks.length}`);
    indexLines.push("");

    let totalPagesIndexed = 0;

    for (const nb of filteredNotebooks) {
      indexLines.push(`## NOTEBOOK: "${nb.title || 'Untitled Notebook'}" (ID: ${nb.id}${nb.is_journal ? ', Type: Daily Journal' : ''})`);
      
      const sections = nb.sections || [];
      if (sections.length === 0) {
        indexLines.push("  *(No sections)*");
        continue;
      }

      for (const sec of sections) {
        indexLines.push(`### SECTION: "${sec.title || 'Untitled Section'}" (ID: ${sec.id})`);
        
        const pages = sec.pages || [];
        if (pages.length === 0) {
          indexLines.push("    *(No pages in this section)*");
          continue;
        }

        for (const page of pages) {
          totalPagesIndexed++;
          const dateStr = page.date || (page.created_at ? new Date(page.created_at).toLocaleDateString() : 'Unknown date');
          indexLines.push(`#### PAGE: "${page.title || 'Untitled Page'}" (PageID: ${page.id}, Date: ${dateStr})`);

          const docState = page.document_state || {};
          
          // A. Text Content
          const texts = docState.texts || [];
          if (texts.length > 0) {
            indexLines.push("  [Notes & Written Content]:");
            for (const t of texts) {
              const rawHtml = t.content || '';
              // Clean HTML tags to readable plain text
              const plain = rawHtml
                .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n### $1\n')
                .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1')
                .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
              if (plain) {
                indexLines.push(`  ${plain}`);
              }
            }
          }

          // B. Meetings, Audio Recordings & Transcripts
          const audios = docState.audios || [];
          if (audios.length > 0) {
            indexLines.push("  [Meetings & Voice Recordings]:");
            for (const a of audios) {
              const meetingTitle = a.title || 'Meeting Recording';
              indexLines.push(`  * MEETING: "${meetingTitle}"`);
              if (a.summary) {
                indexLines.push(`    Summary: ${a.summary.trim()}`);
              }
              if (a.notes) {
                indexLines.push(`    Notes: ${a.notes.trim()}`);
              }
              if (a.transcript) {
                // Keep meaningful excerpt or full transcript (Gemini 3.8 Flash handles massive context)
                const cleanTranscript = a.transcript.trim();
                indexLines.push(`    Transcript: ${cleanTranscript}`);
              }
            }
          }

          indexLines.push(""); // spacer
        }
      }
    }

    if (totalPagesIndexed === 0) {
      indexLines.push("*(Workspace is currently empty or contains no pages)*");
    }

    const contextData = indexLines.join("\n");

    // 4. Construct System Instruction and User Prompt
    const systemPrompt = `You are Motif's intelligent Workspace AI Assistant. You have full visibility into the user's personal knowledge base, including all notebooks, section tabs, pages, written notes, meeting recordings, AI summaries, and full meeting transcripts.

YOUR OBJECTIVE:
Provide direct, perceptive, and highly accurate answers to the user's questions about their notes and meetings.

GUIDELINES FOR SPECIFIC QUESTION TYPES:

1. LOCATING NOTES (e.g., "Where are my notes on osteoporosis?"):
   - Clearly identify which Notebook, Section, and Page contains the requested topic.
   - Summarize what is written in those notes or what was discussed in the meeting.
   - Quote key excerpts, dates, and conclusions so the user understands what they wrote.
   - Always include the page in the "sources" array.

2. CROSS-NOTEBOOK & CROSS-MEETING SYNTHESIS (e.g., "What has been the main topic of all the meetings in the Jellyfish notebook?"):
   - Scan all relevant pages and meeting recordings within that notebook or scope.
   - Synthesize the overarching themes, key decisions made, recurring topics, unresolved questions, and action items.
   - Break down the synthesis into clear, structured sections (e.g., Major Themes, Decisions & Outcomes, Timeline Progression, Action Items).
   - Reference the specific meetings by title and date.
   - Include all referenced pages in the "sources" array.

3. GENERAL QUESTIONS & FACT LOOKUPS:
   - Base your answers strictly on the user's notes and meeting transcripts.
   - If a topic was not mentioned or no notes exist, politely inform the user that you searched their notebooks and did not find any mention of that topic.

OUTPUT FORMAT:
You MUST respond with valid JSON matching this schema:
{
  "answer": "Polished, helpful response in clean GitHub-flavored Markdown. Use headings, bullet points, and bold text for clarity.",
  "sources": [
    {
      "pageId": "Exact ID of the page from the context (e.g. page_xxx)",
      "pageTitle": "Title of the page",
      "notebookTitle": "Title of the notebook",
      "sectionTitle": "Title of the section",
      "snippet": "Short, relevant snippet or summary explaining why this page was referenced (1-2 sentences)"
    }
  ]
}`;

    const chatContents: any[] = [
      { text: systemPrompt },
      { text: `### USER'S COMPLETE WORKSPACE CONTENT:\n${contextData}` }
    ];

    // Add conversation history
    const recentHistory = history.slice(-6);
    for (const h of recentHistory) {
      chatContents.push({
        text: `${h.role === 'user' ? 'User Question' : 'Assistant Answer'}: ${h.text}`
      });
    }

    chatContents.push({
      text: `User Question: ${question}\n\nRespond strictly with the required JSON object containing "answer" and "sources".`
    });

    const ai = new GoogleGenAI({ apiKey });

    // Call Gemini 3.8 Flash (per Google Gemini Model Requirement rule)
    const response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: chatContents,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 8192,
        }
      }),
      { maxAttempts: 4, initialDelayMs: 1500, label: 'ask-ai' }
    );

    const rawOutput = response.text?.trim() || "";

    let parsedResult: { answer: string; sources: AskAISource[] } = {
      answer: rawOutput,
      sources: []
    };

    try {
      const parsed = JSON.parse(rawOutput);
      if (parsed && typeof parsed.answer === 'string') {
        parsedResult = {
          answer: parsed.answer,
          sources: Array.isArray(parsed.sources) ? parsed.sources : []
        };
      }
    } catch {
      // Fallback if model returned formatted text instead of strict JSON
      parsedResult = {
        answer: rawOutput,
        sources: []
      };
    }

    return NextResponse.json({
      success: true,
      answer: parsedResult.answer,
      sources: parsedResult.sources,
      totalPagesSearched: totalPagesIndexed,
      notebooksSearched: filteredNotebooks.length,
    });

  } catch (error: any) {
    console.error("Error in /api/ask-ai:", error);
    const friendlyMessage = formatGeminiErrorMessage(error, "Failed to analyze your notes.");
    const isTransient = isTransientGeminiError(error);
    return NextResponse.json({ error: friendlyMessage }, { status: isTransient ? 503 : 500 });
  }
}
