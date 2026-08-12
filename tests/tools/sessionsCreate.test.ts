import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionsCreate } from "../../src/tools/sessionsCreate.js";
import { BackendError } from "../../src/lib/errors.js";
import type { BackendClient } from "../../src/lib/backendClient.js";

const silentLogger = pino({ level: "silent" });

type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

type Captured = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  handler: ToolHandler;
};

const captureTool = (): { server: McpServer; getCaptured: () => Captured } => {
  let captured: Captured | undefined;
  const server = {
    registerTool: (
      name: string,
      config: { description: string; inputSchema: z.ZodRawShape },
      handler: ToolHandler,
    ) => {
      captured = {
        name,
        description: config.description,
        schema: z.object(config.inputSchema),
        handler,
      };
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
  date: "2026-08-13",
  startTime: "14:00",
  type: "OFFICE_SESSION",
};

const validSessionResponse = {
  id: 42,
  patientName: "Marie Dupont",
  date: "2026-08-13",
  startTime: "14:00",
  endTime: "14:45",
  type: "OFFICE_SESSION",
  status: "SCHEDULED",
  isRecurring: false,
};

describe("sessions.create tool", () => {
  it("registers under the sessions.create name", () => {
    const { server, getCaptured } = captureTool();
    registerSessionsCreate(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("sessions.create");
  });

  it("returns parsed JSON in content[0].text on success", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(validSessionResponse),
    };
    registerSessionsCreate(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validSessionResponse);
    expect(backend.post).toHaveBeenCalledWith(
      "/assistant/sessions",
      {
        patientId: 1,
        date: "2026-08-13",
        startTime: "14:00",
        type: "OFFICE_SESSION",
      },
      { whatsappNumber: "+33612345678" },
    );
  });

  it("rejects a malformed date via Zod before calling backend", () => {
    const { getCaptured } = (() => {
      const c = captureTool();
      registerSessionsCreate(
        c.server,
        { get: vi.fn(), post: vi.fn() } as BackendClient,
        silentLogger,
      );
      return c;
    })();

    const parsed = getCaptured().schema.safeParse({ ...baseInput, date: "13/08/2026" });
    expect(parsed.success).toBe(false);
  });

  it("returns isError:true on backend 409 conflict", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new BackendError(
            "ASSISTANT_SESSION_CONFLICT",
            "Créneau déjà occupé",
            "req-1",
            409,
          ),
        ),
    };
    registerSessionsCreate(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_SESSION_CONFLICT");
  });

  it("returns isError:true when backend response fails Zod validation", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: 42 }),
    };
    registerSessionsCreate(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("UNKNOWN");
  });

  it("description no longer claims moving/rescheduling is impossible, and points to sessions.move", () => {
    const { server, getCaptured } = captureTool();
    registerSessionsCreate(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );

    const { description } = getCaptured();

    expect(description).not.toContain(
      "no tool to cancel, edit, or reschedule",
    );
    expect(description).toContain("sessions.move");
  });
});
