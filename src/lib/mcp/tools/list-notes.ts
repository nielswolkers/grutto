import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_notes",
  title: "List notes",
  description: "List the signed-in user's notes (notities), optionally filtered by folder or search text.",
  inputSchema: {
    folder_name: z.string().trim().optional().describe("Only notes in this folder."),
    search: z.string().trim().optional().describe("Case-insensitive match on the note title."),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ folder_name, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("notes")
      .select("id, title, content, folder_name, is_pinned, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 50);
    if (folder_name) query = query.eq("folder_name", folder_name);
    if (search) query = query.ilike("title", `%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { notes: data ?? [] } };
  },
});
