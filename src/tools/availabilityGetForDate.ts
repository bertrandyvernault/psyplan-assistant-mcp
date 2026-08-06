import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { availableSlotsResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const registerAvailabilityGetForDate = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.tool(
    "availability.get_for_date",
    "Returns the practitioner's free time slots for a specific date (YYYY-MM-DD format). " +
      "When slots is empty, use the flags to explain why: " +
      "isWorkingDay=false means it's a weekend (the practitioner doesn't work); " +
      "coveredByAbsence=true means an absence/vacation covers the whole day; " +
      "otherwise, the schedule is full (no free slots).",
    inputSchema.shape,
    async (input) => {
      try {
        const raw = await backendClient.get<unknown>(
          `/assistant/practitioner/available-slots?date=${input.date}`,
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = availableSlotsResponseSchema.parse(raw);

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
