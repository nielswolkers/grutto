import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_calendar_event",
  title: "Create agenda event",
  description: "Create an agenda event (afspraak) for the signed-in user.",
  inputSchema: {
    title: z.string().trim().min(1),
    start_time: z.string().describe("ISO 8601 start timestamp."),
    end_time: z.string().describe("ISO 8601 end timestamp."),
    description: z.string().trim().optional(),
    location: z.string().trim().optional(),
    all_day: z.boolean().optional(),
    event_type: z.string().trim().optional().describe("Event type label, e.g. afspraak or toets."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, start_time, end_time, description, location, all_day, event_type }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        user_id: ctx.getUserId(),
        title,
        start_time,
        end_time,
        description: description ?? null,
        location: location ?? null,
        all_day: all_day ?? false,
        ...(event_type ? { event_type } : {}),
      })
      .select("id, title, start_time, end_time")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { event: data } };
  },
});
