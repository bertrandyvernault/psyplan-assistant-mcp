import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../lib/logger.js";
import type { BackendClient } from "../lib/backendClient.js";
import { patientSearchResponseSchema } from "../types/backendResponses.js";
import { handleToolError } from "./handleToolError.js";

const inputSchema = z.object({
  whatsappNumber: z.string().regex(/^\+[1-9]\d{6,14}$/),
  name: z.string().min(1),
});

export const registerPatientsSearch = (
  mcpServer: McpServer,
  backendClient: BackendClient,
  logger: Logger,
) => {
  mcpServer.tool(
    "patients.search",
    "Busca pacientes ativos pelo nome (aceita parte do primeiro nome ou sobrenome). " +
      "Use antes de criar uma sessão, para resolver o nome informado pelo praticien em um patientId. " +
      "Se a lista retornada tiver exatamente 1 paciente, use-o diretamente. " +
      "Se tiver mais de 1, liste os nomes completos e pergunte ao praticien qual deles é o correto " +
      "antes de continuar. Se a lista estiver vazia, informe que nenhum paciente foi encontrado com esse nome.",
    inputSchema.shape,
    async (input) => {
      try {
        const raw = await backendClient.get<unknown>(
          `/assistant/patients/search?name=${encodeURIComponent(input.name)}`,
          { whatsappNumber: input.whatsappNumber },
        );
        const parsed = patientSearchResponseSchema.parse(raw);

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
