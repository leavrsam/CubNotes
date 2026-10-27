import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { ShapeNode, ConnectorNode, FlowchartShapeType, AnchorPosition } from '@/components/CustomCanvas';
import { callGeminiWithRetry, formatGeminiErrorMessage, isTransientGeminiError } from '@/lib/geminiRetry';

export const maxDuration = 60;

const COLOR_THEMES: Record<string, { stroke: string; fill: string; text?: string }> = {
  emerald: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.12)', text: '#059669' },
  green: { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.12)', text: '#16a34a' },
  blue: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.12)', text: '#2563eb' },
  indigo: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.12)', text: '#4f46e5' },
  purple: { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.12)', text: '#7c3aed' },
  violet: { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.12)', text: '#9333ea' },
  amber: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.12)', text: '#d97706' },
  orange: { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.12)', text: '#ea580c' },
  rose: { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.12)', text: '#e11d48' },
  red: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.12)', text: '#dc2626' },
  teal: { stroke: '#14b8a6', fill: 'rgba(20, 184, 166, 0.12)', text: '#0d9488' },
  cyan: { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.12)', text: '#0891b2' },
  slate: { stroke: '#64748b', fill: 'rgba(100, 116, 139, 0.12)', text: '#475569' },
};

const DEFAULT_CATEGORY_PALETTE = ['emerald', 'blue', 'purple', 'amber', 'rose', 'teal', 'cyan', 'indigo'];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      prompt = "", 
      notes = "", 
      mode = "auto", // "auto" | "todo" | "workflow" | "decision"
      startX = 100, 
      startY = 100, 
      apiKey: clientApiKey 
    } = body;

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY in Vercel or add your key in Motif Settings." 
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Clean and bound notes content to prevent token/memory timeouts
    const boundedNotes = typeof notes === 'string' && notes.length > 50000 
      ? notes.slice(0, 50000) + "\n\n[...notes truncated for flowchart processing...]" 
      : notes;

    const userContent = [
      prompt ? `User Input / Prompt / List:\n${prompt}` : "",
      boundedNotes ? `Page Notes / Context:\n${boundedNotes}` : ""
    ].filter(Boolean).join('\n\n');

    const systemPrompt = `
You are an expert system diagrammer, organizational architect, and flowchart designer.
Your job is to analyze user input (such as to-do lists, task collections, meeting notes, workflows, or decision trees) and translate it into a clean, intuitive, beautifully organized flowchart.

TARGET CONFIGURATION: ${mode === 'todo' ? 'Strict Categorized To-Do List Mode' : mode === 'workflow' ? 'Sequential Workflow Mode' : mode === 'decision' ? 'Decision Tree Mode' : 'Smart Auto-Detect'}

DIAGRAM ARCHITECTURES:

1. CATEGORIZED TO-DO LIST & TASK HIERARCHY:
   - Use this whenever the input contains a to-do list, task list, list of chores, project tasks, or itemized goals.
   - Group the items into logical categories (e.g., "Household Chores", "Work Tasks", "Project Tasks", "Personal & Errands", "Health & Habits", "Finance & Admin", etc.).
   - Create a Root Node at row: 0 representing the overarching list or goal (e.g., "Weekly To-Do List", "Action Items Overview").
   - Place Category Header nodes at row: 1 across horizontal columns: col: 0, col: 1, col: 2...
   - Center the Root Node over the categories: col = (totalCategories - 1) / 2 (can be a decimal like 0.5, 1, 1.5).
   - Under each category column (col: i), stack its specific tasks vertically: row: 2, row: 3, row: 4, etc.
   - Assign a distinct, vibrant color to each category:
     * "emerald" (household, chores, health)
     * "blue" (work, business, corporate)
     * "purple" (projects, engineering, creative)
     * "amber" (errands, shopping, personal)
     * "rose" (urgent, critical, high-priority)
     * "teal" (finances, admin, legal)
     * "indigo" (root header or general)
   - All tasks belonging to a category MUST share that category's color!
   - Connect Root "bottom" -> each Category Header "top".
   - Connect each Category Header down through its tasks in a clean vertical column:
     Category "bottom" -> Task 1 "top", Task 1 "bottom" -> Task 2 "top", Task 2 "bottom" -> Task 3 "top", etc.

2. SEQUENTIAL WORKFLOW / PROCESS:
   - Use when input describes a step-by-step procedure, pipeline, or lifecycle (e.g. user signup, deployment).
   - Arrange nodes in sequence progressing left-to-right (increasing col) or top-to-bottom (increasing row).
   - Use "rounded" for Start/End, "rectangle" for steps/actions, "parallelogram" for inputs/deliverables, "cylinder" for databases.
   - Connect source "right" (or "bottom") to target "left" (or "top").

3. DECISION TREE:
   - Use when input contains condition checks, branching outcomes, or triage.
   - Use "diamond" for decision points with labeled branch connectors (e.g., label: "Yes", "No", "Approved", "Failed").

Available Shape Types:
- "rounded": Root headers, Category headers, Start/End events
- "rectangle": Tasks, steps, action items
- "diamond": Decisions, condition checks (Yes/No)
- "circle": Milestones, junctions
- "parallelogram": Data inputs, deliverables
- "cylinder": Databases, resources, storage
- "note": Explanatory notes or callouts

Available Colors:
"emerald", "blue", "purple", "amber", "rose", "teal", "indigo", "cyan", "slate"

Output format: Return strictly valid JSON:
{
  "diagramType": "categorized_list" | "workflow" | "decision_tree",
  "title": "Short title",
  "nodes": [
    {
      "id": "node_1",
      "type": "rounded" | "rectangle" | "diamond" | "circle" | "parallelogram" | "cylinder" | "note",
      "text": "Clean, concise text (under 60 characters)",
      "col": 0,
      "row": 0,
      "category": "Household Chores",
      "color": "emerald"
    }
  ],
  "edges": [
    {
      "from": "node_1",
      "fromAnchor": "bottom",
      "to": "node_2",
      "toAnchor": "top",
      "label": ""
    }
  ]
}

DO NOT wrap with markdown backticks. Return strictly raw JSON.
`;

    const response = await callGeminiWithRetry(
      () => ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          systemPrompt,
          userContent || "Organize this to-do list into a flowchart: Clean the kitchen, wash clothes, vacuum living room, review PR #42, team sync with engineering, prepare client demo slides, research database migration, write unit tests for auth module."
        ],
        config: {
          responseMimeType: 'application/json'
        }
      }),
      { maxAttempts: 4, initialDelayMs: 1500, label: 'generate-flowchart' }
    );

    let rawText = response.text || "";
    // Clean potential markdown fencing if any returned
    rawText = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    let parsed: { diagramType?: string; title?: string; nodes: any[]; edges: any[] };
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini flowchart JSON:", rawText);
      return NextResponse.json({ error: "Failed to parse flowchart structure from AI response." }, { status: 500 });
    }

    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      return NextResponse.json({ error: "No diagram nodes generated." }, { status: 400 });
    }

    // Determine if this is a categorized list / to-do breakdown
    const isCategorizedList = mode === 'todo' || 
      parsed.diagramType === 'categorized_list' || 
      parsed.nodes.some(n => n.category && !['root', 'general', 'overview'].includes(String(n.category).toLowerCase()));

    // Map categories to consistent color themes
    const categoryColorMap = new Map<string, string>();
    let nextPaletteIndex = 0;

    const getThemeForNode = (category?: string, suggestedColor?: string, isRoot?: boolean) => {
      if (isRoot) return COLOR_THEMES.indigo;
      
      const catKey = (category || 'default').toLowerCase().trim();
      if (catKey === 'root' || catKey === 'overview') return COLOR_THEMES.indigo;

      if (categoryColorMap.has(catKey)) {
        const themeKey = categoryColorMap.get(catKey)!;
        return COLOR_THEMES[themeKey] || COLOR_THEMES.blue;
      }

      let chosenColor = (suggestedColor || '').toLowerCase().trim();
      if (!COLOR_THEMES[chosenColor] || chosenColor === 'indigo') {
        chosenColor = DEFAULT_CATEGORY_PALETTE[nextPaletteIndex % DEFAULT_CATEGORY_PALETTE.length];
        nextPaletteIndex++;
      }

      categoryColorMap.set(catKey, chosenColor);
      return COLOR_THEMES[chosenColor] || COLOR_THEMES.blue;
    };

    // Auto-center Root Node horizontally over Category Headers in categorized lists
    if (isCategorizedList) {
      const categoryNodes = parsed.nodes.filter(n => n.row === 1 || (n.category && n.category.toLowerCase() !== 'root' && n.row < 2));
      if (categoryNodes.length > 0) {
        const cols = categoryNodes.map(n => typeof n.col === 'number' ? n.col : 0);
        const minCol = Math.min(...cols);
        const maxCol = Math.max(...cols);
        const centerCol = (minCol + maxCol) / 2;

        const rootNode = parsed.nodes.find(n => n.row === 0 || n.category?.toLowerCase() === 'root' || n.id === 'root');
        if (rootNode) {
          rootNode.col = centerCol;
          rootNode.row = 0;
        }
      }
    }

    // Spacing configuration
    const COL_SPACING = isCategorizedList ? 220 : 240;
    const ROW_SPACING = isCategorizedList ? 95 : 130;

    const idMap = new Map<string, string>();

    const shapes: ShapeNode[] = parsed.nodes.map(node => {
      const internalId = uuidv4();
      idMap.set(node.id, internalId);

      const col = typeof node.col === 'number' ? node.col : 0;
      const row = typeof node.row === 'number' ? node.row : 0;
      const x = Math.round(startX + col * COL_SPACING);
      const y = Math.round(startY + row * ROW_SPACING);

      let shapeType: FlowchartShapeType = 'rectangle';
      if (['rectangle', 'rounded', 'diamond', 'circle', 'parallelogram', 'cylinder', 'note'].includes(node.type)) {
        shapeType = node.type as FlowchartShapeType;
      }

      const isRoot = isCategorizedList && (row === 0 || node.category?.toLowerCase() === 'root');
      const isCategoryHeader = isCategorizedList && row === 1;

      if (isRoot || isCategoryHeader) {
        shapeType = 'rounded';
      }

      const theme = getThemeForNode(node.category, node.color, isRoot);

      let width = 180;
      let height = 54;
      let fontSize = 12;

      if (isRoot) {
        width = 200;
        height = 52;
        fontSize = 13;
      } else if (isCategoryHeader) {
        width = 180;
        height = 48;
        fontSize = 13;
      } else if (shapeType === 'circle') {
        width = 85;
        height = 85;
      } else if (shapeType === 'diamond') {
        width = 130;
        height = 85;
      } else {
        const textLen = (node.text || "").length;
        width = 180;
        height = textLen > 40 ? 64 : textLen > 24 ? 54 : 48;
      }

      return {
        id: internalId,
        type: shapeType,
        x,
        y,
        width,
        height,
        text: node.text || "Task",
        fillColor: theme.fill,
        strokeColor: theme.stroke,
        strokeWidth: isRoot ? 2.5 : isCategoryHeader ? 2 : 1.5,
        strokeStyle: 'solid',
        fontSize,
        textAlign: 'center'
      };
    });

    const shapesMap = new Map<string, ShapeNode>();
    shapes.forEach(s => shapesMap.set(s.id, s));

    const connectors: ConnectorNode[] = (parsed.edges || []).map(edge => {
      const fromShapeId = idMap.get(edge.from) || edge.from;
      const toShapeId = idMap.get(edge.to) || edge.to;
      const targetShape = shapesMap.get(toShapeId);
      const sourceShape = shapesMap.get(fromShapeId);

      const validAnchors: AnchorPosition[] = ['top', 'right', 'bottom', 'left'];
      const fromAnchor: AnchorPosition = validAnchors.includes(edge.fromAnchor) 
        ? edge.fromAnchor 
        : isCategorizedList ? 'bottom' : 'right';
      const toAnchor: AnchorPosition = validAnchors.includes(edge.toAnchor) 
        ? edge.toAnchor 
        : isCategorizedList ? 'top' : 'left';

      return {
        id: uuidv4(),
        fromShapeId,
        fromAnchor,
        toShapeId,
        toAnchor,
        routing: isCategorizedList ? 'straight' : 'curved',
        arrowEnd: 'arrow',
        strokeColor: targetShape?.strokeColor || sourceShape?.strokeColor || '#3b82f6',
        strokeWidth: 2,
        strokeStyle: 'solid',
        label: edge.label ? String(edge.label).trim() : undefined
      };
    });

    return NextResponse.json({ 
      shapes, 
      connectors, 
      title: parsed.title || "Flowchart",
      diagramType: isCategorizedList ? 'categorized_list' : (parsed.diagramType || 'workflow')
    });

  } catch (error: any) {
    console.error("Generate Flowchart Error:", error);
    const friendlyMessage = formatGeminiErrorMessage(error, "Failed to generate flowchart");
    const isTransient = isTransientGeminiError(error);
    return NextResponse.json({ error: friendlyMessage }, { status: isTransient ? 503 : 500 });
  }
}
