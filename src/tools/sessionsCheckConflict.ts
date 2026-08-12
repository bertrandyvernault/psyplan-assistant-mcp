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
        "If hasConflict=true, tell the practitioner in one simple sentence that the slot is already " +
        "taken (e.g. \"this time slot is already occupied\") — never mention the raw reason value or " +
        "any technical distinction between EXISTING_SESSION, ACTIVE_RECURRING_SLOT, or " +
        "FUTURE_PUNCTUAL_SESSION; they all mean the same thing to the practitioner: the slot is not " +
        "available. Never create the session if hasConflict=true. " +
        "If hasConflict=true, do NOT propose cancelling or editing the session causing the conflict — no " +
        "tool does that. You CAN suggest moving the conflicting session out of the way first " +
        "(sessions.find then sessions.move) if the practitioner wants that, but never do it without " +
        "their explicit request and confirmation. Otherwise, limit yourself to explaining the conflict " +
        "and suggesting what you can do directly: check another time slot (sessions.check_conflict " +
        "again) or consult availability.get_for_date to find a free slot.",
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
