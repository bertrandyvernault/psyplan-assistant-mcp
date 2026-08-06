import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { assistantSessionResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  patientId: z.number(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
});

export const registerRecurringSessionSlotsCreate = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.tool(
    "recurring_session_slots.create",
    "Creates a weekly recurring slot (same day of week + time, every week starting from startDate). " +
      "Duration is fixed at 45 minutes, calculated automatically — never ask the practitioner for the " +
      "duration. If startDate falls in the current week, that week's session is created immediately " +
      "in addition to the recurring slot; if it's a future week, only the recurring slot is created " +
      "now (future sessions are generated automatically later). startDate cannot be in the past. " +
      "Use patients.search first to resolve the patientId. Use sessions.check_conflict with " +
      "isRecurring=true first to confirm the time slot is free. Only call this tool after the " +
      "practitioner explicitly confirms the summary (patient, day of week, time, type, starting from " +
      "when) — never create without prior confirmation. " +
      "All required parameters (patientId, startDate, startTime, type) must come from information the " +
      "practitioner explicitly gave in this conversation for THIS patient and THIS recurring slot — " +
      "never reuse or infer a value (for example the type OFFICE_SESSION/TELEPHONE_SESSION) from a " +
      "previous session created for a different patient or at another point in the conversation. If " +
      "the type was not explicitly stated for this slot, ask the practitioner before continuing; " +
      "never assume. " +
      "The id returned after creation is for internal use only and must NEVER be shown to the " +
      'practitioner on WhatsApp — never write "(id: X)" or any variation. Confirm the creation by ' +
      "citing only patient, day of week, time, and type. " +
      "This tool only creates recurring slots. There is no tool to cancel, edit, or end an already " +
      "created recurring slot — never offer these actions to the practitioner; if they ask, tell them " +
      "it cannot be done here.",
    inputSchema.shape,
    async (input) => {
      try {
        const raw = await backendClient.post<unknown>(
          "/assistant/recurring-session-slots",
          {
            patientId: input.patientId,
            startDate: input.startDate,
            startTime: input.startTime,
            type: input.type,
          },
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = assistantSessionResponseSchema.parse(raw);

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
