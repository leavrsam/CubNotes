import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, reason, context, noteId } = body;

    console.log("[AI Content Report Received]:", {
      timestamp: new Date().toISOString(),
      reason: reason || "User flagged content",
      noteId,
      context,
      contentSnippet: content ? content.slice(0, 200) : "N/A"
    });

    return NextResponse.json({
      success: true,
      message: "Thank you. Your report has been submitted to our moderation queue for review."
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to submit report" },
      { status: 500 }
    );
  }
}
