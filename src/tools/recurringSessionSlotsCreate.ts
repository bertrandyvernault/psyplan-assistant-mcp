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
    "Cria um horário recorrente semanal (mesmo dia da semana + horário, todas as semanas a partir " +
      "de startDate). A duração é fixa em 45 minutos, calculada automaticamente — nunca pergunte a " +
      "duração ao praticien. Se startDate cair na semana atual, a sessão dessa semana é criada " +
      "imediatamente além do horário recorrente; se for uma semana futura, apenas o horário " +
      "recorrente é criado agora (as sessões futuras são geradas automaticamente depois). " +
      "startDate não pode ser uma data no passado. Use patients.search antes para resolver o " +
      "patientId. Use sessions.check_conflict com isRecurring=true antes para confirmar que o " +
      "horário está livre. Só chame esta ferramenta depois que o praticien confirmar explicitamente " +
      "o resumo (paciente, dia da semana, horário, tipo, a partir de quando) — nunca crie sem " +
      "confirmação prévia.",
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
