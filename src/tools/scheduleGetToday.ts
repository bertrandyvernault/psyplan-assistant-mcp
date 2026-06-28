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
  mcpServer.tool(
    "schedule.get_today",
    "Retorna a agenda do dia atual do praticien (sessões com horário, paciente, tipo, status).",
    inputSchema.shape,
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
