import { describe, it, expect, vi } from "vitest";
import pino from "pino";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPatientsSearch } from "../../src/tools/patientsSearch.js";
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

const validSearchResponse = [
  { id: 1, firstName: "Marie", lastName: "Dupont", fullName: "Marie Dupont" },
];

describe("patients.search tool", () => {
  it("registers under the patients.search name", () => {
    const { server, getCaptured } = captureTool();
    registerPatientsSearch(
      server,
      { get: vi.fn(), post: vi.fn() } as BackendClient,
      silentLogger,
    );
    expect(getCaptured().name).toBe("patients.search");
  });

  it("returns parsed JSON in content[0].text on success", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue(validSearchResponse),
      post: vi.fn(),
    };
    registerPatientsSearch(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      name: "Marie",
    });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(validSearchResponse);
    expect(backend.get).toHaveBeenCalledWith("/assistant/patients/search?name=Marie", {
      whatsappNumber: "+33612345678",
    });
  });

  it("url-encodes the name query parameter", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn(),
    };
    registerPatientsSearch(server, backend, silentLogger);

    await getCaptured().handler({
      whatsappNumber: "+33612345678",
      name: "Jean-François",
    });

    expect(backend.get).toHaveBeenCalledWith(
      "/assistant/patients/search?name=Jean-Fran%C3%A7ois",
      { whatsappNumber: "+33612345678" },
    );
  });

  it("rejects an empty name via Zod before calling backend", () => {
    const { getCaptured } = (() => {
      const c = captureTool();
      registerPatientsSearch(
        c.server,
        { get: vi.fn(), post: vi.fn() } as BackendClient,
        silentLogger,
      );
      return c;
    })();

    const parsed = getCaptured().schema.safeParse({
      whatsappNumber: "+33612345678",
      name: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("returns isError:true on backend error", async () => {
    const { server, getCaptured } = captureTool();
    const backend: BackendClient = {
      get: vi
        .fn()
        .mockRejectedValue(
          new BackendError("ASSISTANT_UNAUTHORIZED", "Não autorizado", "req-1", 401),
        ),
      post: vi.fn(),
    };
    registerPatientsSearch(server, backend, silentLogger);

    const result = await getCaptured().handler({
      whatsappNumber: "+33612345678",
      name: "Marie",
    });

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error.code).toBe("ASSISTANT_UNAUTHORIZED");
  });
});
