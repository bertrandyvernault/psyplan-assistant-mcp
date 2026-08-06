import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerScheduleGetToday } from "../../src/tools/scheduleGetToday.js";
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

const validTodayResponse = {
  date: "2026-06-27",
  items: [
    {
      sessionId: 1,
      startTime: "09:00",
      endTime: "10:00",
      patientName: "Jean Dupont",
      type: "OFFICE_SESSION",
      status: "SCHEDULED",
    },
  ],
};

describe("schedule.get_today tool", () => {
  it("registers under the schedule.get_today name", () => {
    const { server, getCaptured } = captureTool();
    registerScheduleGetToday(
      server,
      { get: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("schedule.get_today");
  });

  it("returns parsed JSON in content[0].text on success", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue(validTodayResponse),
    };
    registerScheduleGetToday(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validTodayResponse);
    expect(backend.get).toHaveBeenCalledWith(
      "/assistant/practitioner/today-schedule",
      { whatsappNumber: "+33612345678" },
    );
  });

  it("rejects a malformed whatsapp number via Zod before calling backend", () => {
    const { getCaptured } = (() => {
      const c = captureTool();
      registerScheduleGetToday(
        c.server,
        { get: vi.fn() } as BackendClient,
        silentLogger,
      );
      return c;
    })();

    const parsed = getCaptured().schema.safeParse({ whatsappNumber: "0612" });
    expect(parsed.success).toBe(false);
  });

  it("returns isError:true on backend 401", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi
        .fn()
        .mockRejectedValue(
          new BackendError(
            "ASSISTANT_PRACTITIONER_UNKNOWN",
            "Numéro inconnu",
            "req-1",
            401,
          ),
        ),
    };
    registerScheduleGetToday(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_PRACTITIONER_UNKNOWN");
  });

  it("returns isError:true when backend response fails Zod validation", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue({ date: "2026-06-27" }),
    };
    registerScheduleGetToday(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("UNKNOWN");
  });
});
