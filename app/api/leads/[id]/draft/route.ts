import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic } from "@/lib/anthropic";
import { requireCampaign } from "@/lib/apiAuth";
import { Leads } from "@/lib/collections";

export const maxDuration = 30;

const DraftSchema = z.object({
  subject: z.string().describe("HARD LIMIT 8 words, subject-line style."),
  draft: z
    .string()
    .describe("EXACTLY 2 short sentences, hard limit 320 characters. Warm, specific, references their real situation, never a hard sell."),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireCampaign();
  if ("error" in result) return result.error;
  const { id } = await ctx.params;

  const leads = await Leads();
  const lead = await leads.findOne({ _id: new ObjectId(id), userId: result.userId });
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const { instructions } = await req.json().catch(() => ({ instructions: undefined }));

  const analysis = await anthropic.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1000,
    thinking: { type: "disabled" },
    system:
      "You are Kylani, writing a founder's outreach message. Rewrite the draft for this one lead. " +
      "Warm, specific, references their real situation, never a hard sell. " +
      "Every field has a hard length limit — those are strict maximums.",
    messages: [
      {
        role: "user",
        content: [
          `What the founder sells: ${result.campaign.whatYouSell}`,
          `Lead: ${lead.name}, ${lead.role} at ${lead.company}`,
          `Why they're a lead: ${lead.detail}`,
          lead.quote ? `Their quote: "${lead.quote}"` : null,
          `Source: ${lead.source}`,
          instructions ? `Founder's note for this rewrite: ${instructions}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: {
      effort: "low",
      format: zodOutputFormat(DraftSchema),
    },
  });

  if (!analysis.parsed_output) {
    return NextResponse.json({ error: "Rewrite failed to parse." }, { status: 502 });
  }

  await leads.updateOne(
    { _id: new ObjectId(id), userId: result.userId },
    { $set: { subject: analysis.parsed_output.subject, draft: analysis.parsed_output.draft, updatedAt: new Date() } },
  );

  return NextResponse.json(analysis.parsed_output);
}
