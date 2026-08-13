import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_study_set",
  title: "Create study set",
  description: "Create a study set for the signed-in user, optionally with flashcards and a linked subject.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Title of the study set."),
    description: z.string().trim().optional(),
    emoji: z.string().trim().max(8).optional().describe("Cover emoji."),
    subject_id: z.string().uuid().optional().describe("Subject (vak) to link the set to."),
    cards: z
      .array(z.object({ term: z.string().trim().min(1), definition: z.string().trim().min(1) }))
      .max(500)
      .optional()
      .describe("Flashcards to add, in order."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, description, emoji, subject_id, cards }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: set, error } = await supabase
      .from("study_sets")
      .insert({ owner_id: ctx.getUserId(), title, description: description ?? null, emoji: emoji ?? "📚", subject_id: subject_id ?? null })
      .select("id, title")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    if (cards?.length) {
      const rows = cards.map((c, i) => ({ set_id: set.id, term: c.term, definition: c.definition, position: i }));
      const { error: cardsError } = await supabase.from("study_cards").insert(rows);
      if (cardsError) return { content: [{ type: "text", text: `Set created (${set.id}) but cards failed: ${cardsError.message}` }], isError: true };
    }

    const payload = { id: set.id, title: set.title, card_count: cards?.length ?? 0, path: `/studieset/${set.id}` };
    return {
      content: [{ type: "text", text: `Study set "${set.title}" created with ${payload.card_count} cards. Open it at ${payload.path}` }],
      structuredContent: payload,
    };
  },
});
