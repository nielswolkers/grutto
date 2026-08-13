import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description: "Create a task (taak) for the signed-in user with a due date and optional time and priority.",
  inputSchema: {
    title: z.string().trim().min(1),
    description: z.string().trim().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Due date, YYYY-MM-DD."),
    due_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().describe("Due time, HH:MM."),
    priority: z.enum(["low", "medium", "high"]).optional().describe("Priority, default medium."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, description, due_date, due_time, priority }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: ctx.getUserId(),
        title,
        description: description ?? null,
        due_date,
        due_time: due_time ?? null,
        priority: priority ?? "medium",
      })
      .select("id, title, due_date, due_time, priority")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { task: data } };
  },
});
