import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description: "List the signed-in user's tasks (taken), optionally filtered by completion state and due-date range.",
  inputSchema: {
    completed: z.boolean().optional().describe("Filter on completion state; omit for all tasks."),
    due_from: z.string().optional().describe("Earliest due date, YYYY-MM-DD."),
    due_to: z.string().optional().describe("Latest due date, YYYY-MM-DD."),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ completed, due_from, due_to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("tasks")
      .select("id, title, description, due_date, due_time, priority, completed, completed_at")
      .order("due_date", { ascending: true })
      .limit(limit ?? 100);
    if (typeof completed === "boolean") query = query.eq("completed", completed);
    if (due_from) query = query.gte("due_date", due_from);
    if (due_to) query = query.lte("due_date", due_to);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { tasks: data ?? [] } };
  },
});
