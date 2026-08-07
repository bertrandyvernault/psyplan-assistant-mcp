import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { todayScheduleResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
});

export const registerScheduleGetToday = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.registerTool(
    "schedule.get_today",
    {
      description:
        "Returns the practitioner's schedule for the current day (sessions with time, patient, type, " +
        "status). The sessionId field of each item is for internal use only and must NEVER be shown to " +
        'the practitioner on WhatsApp — never write "(id: X)" or any variation. When listing the ' +
        "schedule, cite only time, patient, type, and status. The type field is a technical enum " +
        "(OFFICE_SESSION/TELEPHONE_SESSION) for internal use only — never show these raw values; " +
        "always use natural language instead: OFFICE_SESSION means an in-person/office session, " +
        "TELEPHONE_SESSION means a phone/remote session.",
      inputSchema: inputSchema.shape,
    },
    async (input) => {
      try {
        const raw = await backendClient.get<unknown>(
          "/assistant/practitioner/today-schedule",
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = todayScheduleResponseSchema.parse(raw);

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
