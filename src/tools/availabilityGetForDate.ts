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
    "Retorna os horários livres do praticien para uma data específica (formato YYYY-MM-DD). " +
      "Quando slots está vazio, use os flags para explicar o motivo: " +
      "isWorkingDay=false significa fim de semana (o praticien não trabalha); " +
      "coveredByAbsence=true significa ausência/férias no dia todo; " +
      "caso contrário, a agenda está cheia (nenhum horário livre).",
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
