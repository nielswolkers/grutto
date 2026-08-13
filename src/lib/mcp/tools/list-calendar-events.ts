import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_calendar_events",
  title: "List agenda events",
  description: "List the signed-in user's agenda events within an optional date/time range.",
  inputSchema: {
    from: z.string().optional().describe("ISO timestamp or date; only events starting at or after this moment."),
    to: z.string().optional().describe("ISO timestamp or date; only events starting at or before this moment."),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("calendar_events")
      .select("id, title, description, start_time, end_time, all_day, location, event_type, color")
      .order("start_time", { ascending: true })
      .limit(limit ?? 100);
    if (from) query = query.gte("start_time", from);
    if (to) query = query.lte("start_time", to);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { events: data ?? [] } };
  },
});
