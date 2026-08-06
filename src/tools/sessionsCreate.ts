import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { assistantSessionResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  patientId: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
});

export const registerSessionsCreate = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.tool(
    "sessions.create",
    "Creates a punctual session (single occurrence, no weekly repetition). Duration is fixed at " +
      "45 minutes and calculated automatically from startTime — never ask the practitioner for the " +
      "duration. Use patients.search first to resolve the patientId from the given name. " +
      "Use sessions.check_conflict first to confirm the time slot is free. " +
      "Only call this tool after the practitioner explicitly confirms the session summary " +
      "(patient, date, time, type) — never create without prior confirmation. " +
      "All required parameters (patientId, date, startTime, type) must come from information the " +
      "practitioner explicitly gave in this conversation for THIS patient and THIS session — never " +
      "reuse or infer a value (for example the type OFFICE_SESSION/TELEPHONE_SESSION) from a previous " +
      "session created for a different patient or at another point in the conversation. If the type " +
      "was not explicitly stated for this session, ask the practitioner before continuing; never assume. " +
      "The id returned after creation is for internal use only and must NEVER be shown to the " +
      'practitioner on WhatsApp — never write "(id: X)" or any variation. Confirm the creation by ' +
      "citing only patient, date, time, and type. " +
      "This tool only creates sessions. There is no tool to cancel, edit, or reschedule an already " +
      "created session — never offer these actions to the practitioner; if they ask, tell them it " +
      "cannot be done here.",
    inputSchema.shape,
    async (input) => {
      try {
        const raw = await backendClient.post<unknown>(
          "/assistant/sessions",
          {
            patientId: input.patientId,
            date: input.date,
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
