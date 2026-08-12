import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { sessionMoveResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  sessionId: z.number().optional(),
  recurringSlotId: z.number().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newStartTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const registerSessionsMove = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.registerTool(
    "sessions.move",
    {
      description:
        "Moves an existing session to a new date/time, replacing the two-step cancel-then-recreate " +
        "flow. Session duration is preserved automatically — never ask the practitioner for a new end " +
        "time. " +
        "Use sessions.find (or schedule.get_today for a session happening today) first to locate the " +
        "exact session to move, and pass through the sessionId it returned. If that result had no " +
        "sessionId (a not-yet-generated future occurrence of a recurring slot), pass recurringSlotId " +
        "and targetDate instead, exactly as sessions.find returned them — never invent or guess either " +
        "value. " +
        "Use sessions.check_conflict first to confirm the new date/time is free (pass the new date and " +
        "time you are about to move to, not the original ones). " +
        "Only call this tool after the practitioner explicitly confirms both what is being moved " +
        "(patient, original date/time) and the new date/time — never move without prior confirmation. " +
        "The sessionId, recurringSlotId, and targetDate values must come only from a prior sessions.find " +
        "or schedule.get_today call in this same conversation — never reuse them from an earlier, " +
        "unrelated request or infer them. " +
        "The sessionId returned after the move is for internal use only and must NEVER be shown to the " +
        'practitioner on WhatsApp — never write "(id: X)" or any variation. Confirm the move by citing ' +
        "only patient, new date, and new time. " +
        "The type field, if present in the response, is a technical enum (OFFICE_SESSION/" +
        "TELEPHONE_SESSION) for internal use only — never show these raw values; always use natural " +
        "language instead: OFFICE_SESSION means an in-person/office session, TELEPHONE_SESSION means a " +
        "phone/remote session. " +
        "This tool only moves sessions to a new date/time. It cannot change the patient or the session " +
        "type — if the practitioner asks for that, tell them it cannot be done here. There is still no " +
        "tool to cancel or edit a session's notes/status — do not offer those actions either.",
      inputSchema: inputSchema.shape,
    },
    async (input) => {
      try {
        const raw = await backendClient.post<unknown>(
          "/assistant/sessions/move",
          {
            sessionId: input.sessionId,
            recurringSlotId: input.recurringSlotId,
            targetDate: input.targetDate,
            newDate: input.newDate,
            newStartTime: input.newStartTime,
          },
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = sessionMoveResponseSchema.parse(raw);

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
