import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionsMove } from "../../src/tools/sessionsMove.js";
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

const validMoveResponse = {
  id: 42,
  patientName: "Maria Silva",
  date: "2026-08-20",
  startTime: "15:00",
  endTime: "15:45",
  type: "OFFICE_SESSION",
  status: "SCHEDULED",
  isRecurring: false,
};

describe("sessions.move tool", () => {
  it("registers under the sessions.move name", () => {
    const { server, getCaptured } = captureTool();
    registerSessionsMove(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("sessions.move");
  });

  it("moves an existing session by sessionId", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(validMoveResponse),
    };
    registerSessionsMove(server, backend, silentLogger);

    const input = {
      whatsappNumber: "+33612345678",
      sessionId: 42,
      newDate: "2026-08-20",
      newStartTime: "15:00",
    };
    const result = await getCaptured().handler(input);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validMoveResponse);
    expect(backend.post).toHaveBeenCalledWith(
      "/assistant/sessions/move",
      {
        sessionId: 42,
        recurringSlotId: undefined,
        targetDate: undefined,
        newDate: "2026-08-20",
        newStartTime: "15:00",
      },
      { whatsappNumber: "+33612345678" },
    );
  });

  it("moves a not-yet-generated recurring occurrence by recurringSlotId+targetDate", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(validMoveResponse),
    };
    registerSessionsMove(server, backend, silentLogger);

    const input = {
      whatsappNumber: "+33612345678",
      recurringSlotId: 7,
      targetDate: "2026-08-14",
      newDate: "2026-08-20",
      newStartTime: "15:00",
    };
    const result = await getCaptured().handler(input);

    expect(result.isError).toBeUndefined();
    expect(backend.post).toHaveBeenCalledWith(
      "/assistant/sessions/move",
      {
        sessionId: undefined,
        recurringSlotId: 7,
        targetDate: "2026-08-14",
        newDate: "2026-08-20",
        newStartTime: "15:00",
      },
      { whatsappNumber: "+33612345678" },
    );
  });

  it("accepts input without sessionId nor recurringSlotId+targetDate at the Zod layer (delegated to backend)", () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = { get: vi.fn(), post: vi.fn() };
    registerSessionsMove(server, backend, silentLogger);

    const parsed = getCaptured().schema.safeParse({
      whatsappNumber: "+33612345678",
      newDate: "2026-08-20",
      newStartTime: "15:00",
    });

    expect(parsed.success).toBe(true);
  });

  it("propagates a 400 error from backend when neither identifier is provided", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new BackendError(
            "ASSISTANT_SESSION_MOVE_MISSING_TARGET",
            "sessionId or recurringSlotId+targetDate is required",
            "req-1",
            400,
          ),
        ),
    };
    registerSessionsMove(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      newDate: "2026-08-20",
      newStartTime: "15:00",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_SESSION_MOVE_MISSING_TARGET");
  });

  it("propagates SESSION_NOT_MOVABLE via handleToolError", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new BackendError(
            "SESSION_NOT_MOVABLE",
            "Cette séance ne peut pas être déplacée",
            "req-1",
            409,
          ),
        ),
    };
    registerSessionsMove(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      sessionId: 42,
      newDate: "2026-08-20",
      newStartTime: "15:00",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("SESSION_NOT_MOVABLE");
  });

  it("propagates SESSION_MOVE_CONFLICT via handleToolError", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new BackendError(
            "SESSION_MOVE_CONFLICT",
            "Le nouveau créneau est déjà occupé",
            "req-1",
            409,
          ),
        ),
    };
    registerSessionsMove(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      sessionId: 42,
      newDate: "2026-08-20",
      newStartTime: "15:00",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("SESSION_MOVE_CONFLICT");
  });

  it("returns isError:true when backend response fails Zod validation", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ sessionId: 42 }),
    };
    registerSessionsMove(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      sessionId: 42,
      newDate: "2026-08-20",
      newStartTime: "15:00",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("UNKNOWN");
  });
});
