import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { ShapeNode, ConnectorNode, FlowchartShapeType, AnchorPosition } from '@/components/CustomCanvas';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt = "", notes = "", startX = 100, startY = 100, apiKey: clientApiKey } = body;

    const apiKey = clientApiKey || req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY in Vercel or add your key in CubNotes Settings." 
      }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const userContent = [
      prompt ? `User Prompt / Description: ${prompt}` : "",
      notes ? `Meeting Notes / Document Context:\n${notes}` : ""
    ].filter(Boolean).join('\n\n');

    const systemPrompt = `
You are a senior system architect and diagramming expert.
Your job is to translate user descriptions or meeting notes into a clean, intuitive flowchart diagram.

Available shape types:
- "rounded": Start, End, or Trigger events
- "rectangle": Steps, processes, actions, or tasks
- "diamond": Decisions, condition checks (Yes / No, Pass / Fail)
- "circle": Junction points, milestones
- "parallelogram": Data input / output
- "cylinder": Database, data storage
- "note": Explanatory notes or callouts

Guidelines:
1. Break down the process into 4 to 12 clear, logical steps.
2. Arrange nodes on a 2D grid using "col" (horizontal column, 0-indexed) and "row" (vertical row, 0-indexed).
   Flow should generally proceed left-to-right (increasing col) or top-to-bottom.
   For branches (from diamonds), place alternate branches on adjacent rows.
3. Every connection must specify:
   - "from": source node ID
   - "to": target node ID
   - "fromAnchor": "top" | "right" | "bottom" | "left" (usually "right" or "bottom")
   - "toAnchor": "top" | "right" | "bottom" | "left" (usually "left" or "top")
   - "label": optional branch label (e.g. "Yes", "No", "Success", "Error")

Output MUST be strictly valid JSON matching this schema:
{
  "nodes": [
    {
      "id": "node_1",
      "type": "rounded",
      "text": "Start process",
      "col": 0,
      "row": 0
    }
  ],
  "edges": [
    {
      "from": "node_1",
      "fromAnchor": "right",
      "to": "node_2",
      "toAnchor": "left",
      "label": ""
    }
  ]
}

DO NOT include markdown wrappers or backticks. Return ONLY raw JSON.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        systemPrompt,
        userContent || "Generate a standard product development workflow from idea to deployment."
      ],
    });

    let rawText = response.text || "";
    // Clean potential markdown fencing
    rawText = rawText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    let parsed: { nodes: any[]; edges: any[] };
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini flowchart JSON:", rawText);
      return NextResponse.json({ error: "Failed to parse flowchart structure from AI response." }, { status: 500 });
    }

    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      return NextResponse.json({ error: "No diagram nodes generated." }, { status: 400 });
    }

    // Map AI output to CubNotes ShapeNode and ConnectorNode with spatial coordinates
    const idMap = new Map<string, string>();
    const COL_SPACING = 240;
    const ROW_SPACING = 140;

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

      // Clean semi-transparent styling with crisp borders
      let fillColor = 'rgba(59, 130, 246, 0.08)';
      let strokeColor = '#3b82f6';
      if (shapeType === 'rounded') {
        fillColor = 'rgba(34, 197, 94, 0.12)'; // green-ish
        strokeColor = '#22c55e';
      } else if (shapeType === 'diamond') {
        fillColor = 'rgba(245, 158, 11, 0.12)'; // amber-ish
        strokeColor = '#f59e0b';
      } else if (shapeType === 'cylinder') {
        fillColor = 'rgba(168, 85, 247, 0.12)'; // purple
        strokeColor = '#a855f7';
      }

      return {
        id: internalId,
        type: shapeType,
        x,
        y,
        width: shapeType === 'circle' ? 90 : shapeType === 'diamond' ? 140 : 160,
        height: shapeType === 'circle' ? 90 : shapeType === 'diamond' ? 90 : 75,
        text: node.text || "Step",
        fillColor,
        strokeColor,
        strokeWidth: 2,
        strokeStyle: 'solid',
        fontSize: 13,
        textAlign: 'center'
      };
    });

    const connectors: ConnectorNode[] = (parsed.edges || []).map(edge => {
      const fromShapeId = idMap.get(edge.from) || edge.from;
      const toShapeId = idMap.get(edge.to) || edge.to;

      const validAnchors: AnchorPosition[] = ['top', 'right', 'bottom', 'left'];
      const fromAnchor: AnchorPosition = validAnchors.includes(edge.fromAnchor) ? edge.fromAnchor : 'right';
      const toAnchor: AnchorPosition = validAnchors.includes(edge.toAnchor) ? edge.toAnchor : 'left';

      return {
        id: uuidv4(),
        fromShapeId,
        fromAnchor,
        toShapeId,
        toAnchor,
        routing: 'curved', // Default curved Bezier routing
        arrowEnd: 'arrow',
        strokeColor: '#3b82f6',
        strokeWidth: 2,
        strokeStyle: 'solid',
        label: edge.label ? String(edge.label).trim() : undefined
      };
    });

    return NextResponse.json({ shapes, connectors });

  } catch (error: any) {
    console.error("Generate Flowchart Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate flowchart" }, { status: 500 });
  }
}
