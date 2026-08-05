import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAvailabilityGetForDate } from "../../src/tools/availabilityGetForDate.js";
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

const validSlotsResponse = {
  date: "2026-05-01",
  slotDurationMinutes: 60,
  coveredByAbsence: false,
  isWorkingDay: true,
  slots: [
    { startTime: "09:00", endTime: "10:00" },
    { startTime: "10:00", endTime: "11:00" },
  ],
};

describe("availability.get_for_date tool", () => {
  it("registers under the availability.get_for_date name", () => {
    const { server, getCaptured } = captureTool();
    registerAvailabilityGetForDate(
      server,
      { get: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("availability.get_for_date");
  });

  it("returns formatted response on valid date + backend OK", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue(validSlotsResponse),
    };
    registerAvailabilityGetForDate(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      date: "2026-05-01",
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validSlotsResponse);
    expect(backend.get).toHaveBeenCalledWith(
      "/assistant/practitioner/available-slots?date=2026-05-01",
      { whatsappNumber: "+33612345678" },
    );
  });

  it("rejects an invalid date format via Zod before calling backend", () => {
    const { getCaptured } = (() => {
      const c = captureTool();
      registerAvailabilityGetForDate(
        c.server,
        { get: vi.fn() } as BackendClient,
        silentLogger,
      );
      return c;
    })();

    const parsed = getCaptured().schema.safeParse({
      whatsappNumber: "+33612345678",
      date: "2026/05/01",
    });
    expect(parsed.success).toBe(false);
  });

  it("propagates coveredByAbsence:true as-is to the agent", async () => {
    const { server, getCaptured } = captureTool();
    const response = { ...validSlotsResponse, coveredByAbsence: true, slots: [] };
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue(response),
    };
    registerAvailabilityGetForDate(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      date: "2026-05-01",
    });

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.coveredByAbsence).toBe(true);
    expect(payload.slots).toEqual([]);
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
    registerAvailabilityGetForDate(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      date: "2026-05-01",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_PRACTITIONER_UNKNOWN");
  });
});
