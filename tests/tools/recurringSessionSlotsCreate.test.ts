import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecurringSessionSlotsCreate } from "../../src/tools/recurringSessionSlotsCreate.js";
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
  startDate: "2026-08-13",
  startTime: "14:00",
  type: "OFFICE_SESSION",
};

const validSlotResponse = {
  id: 7,
  patientName: "Marie Dupont",
  date: "2026-08-13",
  startTime: "14:00",
  endTime: "14:45",
  type: "OFFICE_SESSION",
  status: "SCHEDULED",
  isRecurring: true,
};

describe("recurring_session_slots.create tool", () => {
  it("registers under the recurring_session_slots.create name", () => {
    const { server, getCaptured } = captureTool();
    registerRecurringSessionSlotsCreate(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("recurring_session_slots.create");
  });

  it("returns parsed JSON in content[0].text on success", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue(validSlotResponse),
    };
    registerRecurringSessionSlotsCreate(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validSlotResponse);
    expect(backend.post).toHaveBeenCalledWith(
      "/assistant/recurring-session-slots",
      {
        patientId: 1,
        startDate: "2026-08-13",
        startTime: "14:00",
        type: "OFFICE_SESSION",
      },
      { whatsappNumber: "+33612345678" },
    );
  });

  it("rejects a malformed startDate via Zod before calling backend", () => {
    const { getCaptured } = (() => {
      const c = captureTool();
      registerRecurringSessionSlotsCreate(
        c.server,
        { get: vi.fn(), post: vi.fn() } as BackendClient,
        silentLogger,
      );
      return c;
    })();

    const parsed = getCaptured().schema.safeParse({
      ...baseInput,
      startDate: "13/08/2026",
    });
    expect(parsed.success).toBe(false);
  });

  it("returns isError:true on backend 400 when startDate is in the past", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn(),
      post: vi
        .fn()
        .mockRejectedValue(
          new BackendError(
            "PAST_RECURRING_SESSION",
            "Récurrence dans le passé",
            "req-1",
            400,
          ),
        ),
    };
    registerRecurringSessionSlotsCreate(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("PAST_RECURRING_SESSION");
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
    registerRecurringSessionSlotsCreate(server, backend, silentLogger);

    const result = await getCaptured().handler(baseInput);

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_SESSION_CONFLICT");
  });
});
