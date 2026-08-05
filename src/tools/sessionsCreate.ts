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
    "Cria uma sessão pontual (único encontro, sem repetição semanal). A duração é fixa em 45 " +
      "minutos e calculada automaticamente a partir de startTime — nunca pergunte a duração ao " +
      "praticien. Use patients.search antes para resolver o patientId a partir do nome informado. " +
      "Use sessions.check_conflict antes para confirmar que o horário está livre. " +
      "Só chame esta ferramenta depois que o praticien confirmar explicitamente o resumo da sessão " +
      "(paciente, data, horário, tipo) — nunca crie sem confirmação prévia.",
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
