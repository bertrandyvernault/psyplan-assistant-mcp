import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { sessionConflictCheckResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  isRecurring: z.boolean(),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
});

export const registerSessionsCheckConflict = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.registerTool(
    "sessions.check_conflict",
    {
      description:
        "Checks whether a time slot is free BEFORE creating a punctual or recurring session. " +
        "Use isRecurring=true to check a weekly recurring slot (day of week + time, every week " +
        "starting from date), or isRecurring=false to check only that date. " +
        "ALWAYS call this tool before sessions.create or recurring_session_slots.create, " +
        "so you never promise a time slot to the practitioner that then fails on creation. " +
        "If hasConflict=true, explain the reason in natural language without using the raw " +
        "technical value of reason: " +
        "EXISTING_SESSION means a session already exists at that time; " +
        "ACTIVE_RECURRING_SLOT means another patient already has a recurring slot on that day/time; " +
        "FUTURE_PUNCTUAL_SESSION means a future punctual session already occupies that day of week/time. " +
        "Never create the session if hasConflict=true. " +
        "If hasConflict=true, do NOT propose actions you have no way to perform, such as cancelling, " +
        "rescheduling, or moving the session causing the conflict — no available tool does that. " +
        "Limit yourself to explaining the conflict and suggesting only what you can actually do: " +
        "check another time slot (sessions.check_conflict again) or consult availability.get_for_date " +
        "to find a free slot.",
      inputSchema: inputSchema.shape,
    },
    async (input) => {
      try {
        const raw = await backendClient.post<unknown>(
          "/assistant/sessions/check-conflict",
          {
            date: input.date,
            startTime: input.startTime,
            isRecurring: input.isRecurring,
            type: input.type,
          },
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = sessionConflictCheckResponseSchema.parse(raw);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(parsed),
            },
          ],
        };
      } catch (err) {
        return handleToolError(err, logger);
      }
    },
  );
};
