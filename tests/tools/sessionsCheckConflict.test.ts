import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionsCheckConflict } from "../../src/tools/sessionsCheckConflict.js";
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
    tool: (
      name: string,
      _description: string,
      shape: z.ZodRawShape,
      handler: ToolHandler,
    ) => {
      captured = { name, schema: z.object(shape), handler };
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
  date: "2026-08-13",
  startTime: "14:00",
  isRecurring: false,
  type: "OFFICE_SESSION",
};

describe("sessions.check_conflict tool", () => {
  it("registers under the sessions.check_conflict name", () => {
    const { server, getCaptured } = captureTool();
    registerSessionsCheckConflict(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("sessions.check_conflict");
  });

  it("returns hasConflict false when the slot is free", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ hasConflict: false, reason: null }),
    };
    registerSessionsCheckConflict(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({
      hasConflict: false,
      reason: null,
    });
    expect(backend.post).toHaveBeenCalledWith(
      "/assistant/sessions/check-conflict",
      {
        date: "2026-08-13",
        startTime: "14:00",
        isRecurring: false,
        type: "OFFICE_SESSION",
      },
      { whatsappNumber: "+33612345678" },
    );
  });

  it("propagates hasConflict true with reason", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockResolvedValue({ hasConflict: true, reason: "EXISTING_SESSION" }),
    };
    registerSessionsCheckConflict(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(JSON.parse(result.content[0].text)).toEqual({
      hasConflict: true,
      reason: "EXISTING_SESSION",
    });
  });

  it("rejects a malformed startTime via Zod before calling backend", () => {
    const { getCaptured } = (() => {
      const c = captureTool();
      registerSessionsCheckConflict(
        c.server,
        { get: vi.fn(), post: vi.fn() } as BackendClient,
        silentLogger,
      );
      return c;
    })();

    const parsed = getCaptured().schema.safeParse({
      ...baseInput,
      startTime: "2pm",
    });
    expect(parsed.success).toBe(false);
  });

  it("returns isError:true on backend error", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new BackendError("ASSISTANT_INVALID_DATE", "Data inválida", "req-1", 400),
        ),
    };
    registerSessionsCheckConflict(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_INVALID_DATE");
  });
});
