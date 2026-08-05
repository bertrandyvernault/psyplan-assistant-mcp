import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { sessionConflictCheckResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  isRecurring: z.boolean(),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
});

export const registerSessionsCheckConflict = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.tool(
    "sessions.check_conflict",
    "Verifica se um horário está livre ANTES de criar uma sessão pontual ou recorrente. " +
      "Use isRecurring=true para verificar um horário recorrente semanal (dia da semana + horário " +
      "de todas as semanas a partir de date), ou isRecurring=false para verificar apenas essa data. " +
      "SEMPRE chame esta ferramenta antes de sessions.create ou recurring_session_slots.create, " +
      "para não prometer um horário ao praticien que depois falha na criação. " +
      "Se hasConflict=true, explique o motivo em linguagem natural sem usar o valor técnico de reason: " +
      "EXISTING_SESSION significa que já existe uma sessão nesse horário; " +
      "ACTIVE_RECURRING_SLOT significa que outro paciente já tem um horário recorrente nesse dia/horário; " +
      "FUTURE_PUNCTUAL_SESSION significa que uma sessão pontual futura já ocupa esse dia da semana/horário. " +
      "Nunca crie a sessão se hasConflict=true.",
    inputSchema.shape,
    async (input) => {
      try {
        const raw = await backendClient.post<unknown>(
          "/assistant/sessions/check-conflict",
          {
            date: input.date,
            startTime: input.startTime,
            isRecurring: input.isRecurring,
            type: input.type,
          },
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = sessionConflictCheckResponseSchema.parse(raw);

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
