import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_study_sets",
  title: "List study sets",
  description: "List the signed-in user's study sets (studiesets), optionally filtered by subject id.",
  inputSchema: {
    subject_id: z.string().uuid().optional().describe("Only return sets linked to this subject."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum number of sets (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ subject_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("study_sets")
      .select("id, title, description, emoji, subject_id, updated_at, study_cards(count)")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 50);
    if (subject_id) query = query.eq("subject_id", subject_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const sets = (data ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      emoji: s.emoji,
      subject_id: s.subject_id,
      updated_at: s.updated_at,
      card_count: s.study_cards?.[0]?.count ?? 0,
    }));
    return { content: [{ type: "text", text: JSON.stringify(sets) }], structuredContent: { sets } };
  },
});
