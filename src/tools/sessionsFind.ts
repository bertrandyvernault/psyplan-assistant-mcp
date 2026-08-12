import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { sessionSearchResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  patientId: z.number(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const registerSessionsFind = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.registerTool(
    "sessions.find",
    {
      description:
        "Finds a patient's sessions within a date range. Use this before sessions.move to locate the " +
        "exact session the practitioner wants to move, whenever it is not part of today's schedule " +
        "(for today's sessions, schedule.get_today can be used instead, but sessions.find also works). " +
        "Use patients.search first to resolve the patientId. Pick a fromDate/toDate range that covers " +
        "what the practitioner described (for example, a specific week if they said 'next Thursday'). " +
        "If the returned list has exactly 1 session, use it directly. " +
        "If it has more than 1, list them with date and time only and ask the practitioner to confirm " +
        "which one before continuing — never guess. " +
        "If the list is empty, tell the practitioner no session was found for that patient in that " +
        "period; never invent one. " +
        "The sessionId and recurringSlotId fields of each result are for internal use only (to pass to " +
        "sessions.move afterwards) and must NEVER appear in the message sent to the practitioner on " +
        'WhatsApp — never write "(id: X)" or any variation. When listing sessions for the practitioner ' +
        "to choose from, cite only date, time, and type. " +
        "The type field is a technical enum (OFFICE_SESSION/TELEPHONE_SESSION) for internal use only — " +
        "never show these raw values; always use natural language instead: OFFICE_SESSION means an " +
        "in-person/office session, TELEPHONE_SESSION means a phone/remote session. " +
        "This tool only searches for existing sessions — it does not create, cancel, or move anything.",
      inputSchema: inputSchema.shape,
    },
    async (input) => {
      try {
        const raw = await backendClient.get<unknown>(
          `/assistant/sessions/search?patientId=${input.patientId}&fromDate=${input.fromDate}&toDate=${input.toDate}`,
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = sessionSearchResponseSchema.parse(raw);

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
