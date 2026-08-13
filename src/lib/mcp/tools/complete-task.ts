import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "complete_task",
  title: "Complete or reopen task",
  description: "Mark one of the signed-in user's tasks as completed, or reopen it.",
  inputSchema: {
    task_id: z.string().uuid(),
    completed: z.boolean().optional().describe("True to complete (default), false to reopen."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, completed }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const done = completed !== false;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .update({ completed: done, completed_at: done ? new Date().toISOString() : null })
      .eq("id", task_id)
      .select("id, title, completed")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Task not found or not accessible." }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { task: data } };
  },
});
