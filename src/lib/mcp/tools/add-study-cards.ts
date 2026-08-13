import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_study_cards",
  title: "Add study cards",
  description: "Append flashcards (term/definition pairs) to an existing study set owned by the signed-in user.",
  inputSchema: {
    set_id: z.string().uuid().describe("The study set to add cards to."),
    cards: z
      .array(z.object({ term: z.string().trim().min(1), definition: z.string().trim().min(1) }))
      .min(1)
      .max(500),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ set_id, cards }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data: last, error: posError } = await supabase
      .from("study_cards")
      .select("position")
      .eq("set_id", set_id)
      .order("position", { ascending: false })
      .limit(1);
    if (posError) return { content: [{ type: "text", text: posError.message }], isError: true };
    const start = (last?.[0]?.position ?? -1) + 1;
    const rows = cards.map((c, i) => ({ set_id, term: c.term, definition: c.definition, position: start + i }));
    const { data, error } = await supabase.from("study_cards").insert(rows).select("id");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Added ${data?.length ?? 0} cards. Open the set at /studieset/${set_id}` }],
      structuredContent: { added: data?.length ?? 0, path: `/studieset/${set_id}` },
    };
  },
});
