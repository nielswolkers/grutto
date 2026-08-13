import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_note",
  title: "Create note",
  description: "Create a note (notitie) for the signed-in user, optionally inside a folder.",
  inputSchema: {
    title: z.string().trim().min(1),
    content: z.string().optional(),
    folder_name: z.string().trim().optional(),
    is_pinned: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, content, folder_name, is_pinned }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: ctx.getUserId(),
        title,
        content: content ?? "",
        folder_name: folder_name ?? null,
        is_pinned: is_pinned ?? false,
      })
      .select("id, title, folder_name")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { note: data } };
  },
});
