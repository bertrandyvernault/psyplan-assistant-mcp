import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./lib/config.js";
import { createLogger } from "./lib/logger.js";
import { createBackendClient } from "./lib/backendClient.js";
import { registerScheduleGetToday } from "./tools/scheduleGetToday.js";
import { registerAvailabilityGetForDate } from "./tools/availabilityGetForDate.js";
import { registerPatientsSearch } from "./tools/patientsSearch.js";
import { registerSessionsCheckConflict } from "./tools/sessionsCheckConflict.js";
import { registerSessionsCreate } from "./tools/sessionsCreate.js";
import { registerSessionsFind } from "./tools/sessionsFind.js";
import { registerSessionsMove } from "./tools/sessionsMove.js";
import { registerRecurringSessionSlotsCreate } from "./tools/recurringSessionSlotsCreate.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const backendClient = createBackendClient(config, logger);

const mcpServer = new McpServer({
  name: "psyplan-assistant-mcp",
  version: "1.0.0",
});

registerScheduleGetToday(mcpServer, backendClient, logger);
registerAvailabilityGetForDate(mcpServer, backendClient, logger);
registerPatientsSearch(mcpServer, backendClient, logger);
registerSessionsCheckConflict(mcpServer, backendClient, logger);
registerSessionsCreate(mcpServer, backendClient, logger);
registerSessionsFind(mcpServer, backendClient, logger);
registerSessionsMove(mcpServer, backendClient, logger);
registerRecurringSessionSlotsCreate(mcpServer, backendClient, logger);

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
  });
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "psyplan-assistant-mcp listening");
});
