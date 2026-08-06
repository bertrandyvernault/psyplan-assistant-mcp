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
  mcpServer.registerTool(
    "patients.search",
    {
      description:
        "Searches active patients by name (accepts part of the first or last name). " +
        "Use before creating a session, to resolve the name given by the practitioner into a patientId. " +
        "If the returned list has exactly 1 patient, use it directly. " +
        "If it has more than 1, list the full names and ask the practitioner which one is correct " +
        "before continuing. If the list is empty, inform them that no patient was found with that name. " +
        "The id field of each patient is for internal use only (to fill patientId in subsequent calls) " +
        "and must NEVER appear in the message sent to the practitioner on WhatsApp — never write " +
        '"(id: X)" or any variation. When listing patients for the practitioner to choose from, use ' +
        "only the full name.",
      inputSchema: inputSchema.shape,
    },
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
