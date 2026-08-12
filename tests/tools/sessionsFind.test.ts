import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionsFind } from "../../src/tools/sessionsFind.js";
import { BackendError } from "../../src/lib/errors.js";
import type { BackendClient } from "../../src/lib/backendClient.js";

const silentLogger = pino({ level: "silent" });

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

type Captured = {
  name: string;
  schema: z.ZodObject<z.ZodRawShape>;
  handler: ToolHandler;
};

const captureTool = (): { server: McpServer; getCaptured: () => Captured } => {
  let captured: Captured | undefined;
  const server = {
    registerTool: (
      name: string,
      config: { inputSchema: z.ZodRawShape },
      handler: ToolHandler,
    ) => {
      captured = { name, schema: z.object(config.inputSchema), handler };
    },
  } as unknown as McpServer;
  return {
    server,
    getCaptured: () => {
      if (!captured) throw new Error("tool not registered");
      return captured;
    },
  };
};

const baseInput = {
  whatsappNumber: "+33612345678",
  patientId: 1,
  fromDate: "2026-08-10",
  toDate: "2026-08-16",
};

const validSearchResponse = [
  {
    sessionId: 42,
    recurringSlotId: null,
    date: "2026-08-13",
    startTime: "14:00",
    endTime: "14:45",
    type: "OFFICE_SESSION",
    status: "SCHEDULED",
  },
];

describe("sessions.find tool", () => {
  it("registers under the sessions.find name", () => {
    const { server, getCaptured } = captureTool();
    registerSessionsFind(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("sessions.find");
  });

  it("returns parsed JSON list in content[0].text on success", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue(validSearchResponse),
      post: vi.fn(),
    };
    registerSessionsFind(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validSearchResponse);
    expect(backend.get).toHaveBeenCalledWith(
      "/assistant/sessions/search?patientId=1&fromDate=2026-08-10&toDate=2026-08-16",
      { whatsappNumber: "+33612345678" },
    );
  });

  it("handles a virtual occurrence with sessionId=null and recurringSlotId set", async () => {
    const { server, getCaptured } = captureTool();
    const virtualOccurrence = [
      {
        sessionId: null,
        recurringSlotId: 7,
        date: "2026-08-14",
        startTime: "10:00",
        endTime: "10:45",
        type: "TELEPHONE_SESSION",
        status: "SCHEDULED",
      },
    ];
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue(virtualOccurrence),
      post: vi.fn(),
    };
    registerSessionsFind(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(virtualOccurrence);
  });

  it("rejects a missing patientId via Zod before calling backend", () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = { get: vi.fn(), post: vi.fn() };
    registerSessionsFind(server, backend, silentLogger);

    const { patientId: _patientId, ...withoutPatientId } = baseInput;
    const parsed = getCaptured().schema.safeParse(withoutPatientId);

    expect(parsed.success).toBe(false);
    expect(backend.get).not.toHaveBeenCalled();
  });

  it("returns isError:true on backend error", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi
        .fn()
        .mockRejectedValue(
          new BackendError("ASSISTANT_PATIENT_NOT_FOUND", "Patient introuvable", "req-1", 404),
        ),
      post: vi.fn(),
    };
    registerSessionsFind(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_PATIENT_NOT_FOUND");
  });

  it("returns isError:true when backend response fails Zod validation", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue([{ sessionId: 42 }]),
      post: vi.fn(),
    };
    registerSessionsFind(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("UNKNOWN");
  });
});
