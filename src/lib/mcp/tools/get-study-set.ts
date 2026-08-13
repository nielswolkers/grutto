import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_study_set",
  title: "Get study set",
  description: "Get one study set with all of its flashcards (term/definition pairs).",
  inputSchema: { set_id: z.string().uuid().describe("The study set id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ set_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: set, error } = await supabase
      .from("study_sets")
      .select("id, title, description, emoji, subject_id, created_at, updated_at")
      .eq("id", set_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!set) return { content: [{ type: "text", text: "Study set not found or not accessible." }], isError: true };
    const { data: cards, error: cardsError } = await supabase
      .from("study_cards")
      .select("id, term, definition, position")
      .eq("set_id", set_id)
      .order("position", { ascending: true });
    if (cardsError) return { content: [{ type: "text", text: cardsError.message }], isError: true };
    const payload = { ...set, cards: cards ?? [] };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  },
});
