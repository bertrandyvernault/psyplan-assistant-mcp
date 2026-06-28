import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import pino from "pino";
import { createBackendClient } from "../../src/lib/backendClient.js";
import { BackendError } from "../../src/lib/errors.js";
import type { Config } from "../../src/lib/config.js";

const config: Config = {
  PSYPLAN_BACKEND_URL: "http://psyplan-backend:8080",
  PSYPLAN_BACKEND_ASSISTANT_API_KEY: "a".repeat(32),
  PORT: 3000,
  LOG_LEVEL: "info",
  BACKEND_TIMEOUT_MS: 5000,
};

const silentLogger = pino({ level: "silent" });

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

describe("backendClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed body on 200", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, { date: "2026-06-27", items: [] }),
    );

    const client = createBackendClient(config, silentLogger);
    const result = await client.get<{ date: string }>("/path", {
      whatsappNumber: "+33612345678",
    });

    expect(result).toEqual({ date: "2026-06-27", items: [] });
  });

  it("maps a 401 backend error to BackendError with backend errorCode", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(401, {
        errorCode: "ASSISTANT_PRACTITIONER_UNKNOWN",
        message: "Numéro inconnu",
      }),
    );

    const client = createBackendClient(config, silentLogger);

    await expect(
      client.get("/path", { whatsappNumber: "+33612345678" }),
    ).rejects.toMatchObject({
      code: "ASSISTANT_PRACTITIONER_UNKNOWN",
      httpStatus: 401,
    });
  });

  it("maps a fetch failure (timeout/abort) to BACKEND_UNREACHABLE", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );

    const client = createBackendClient(config, silentLogger);

    await expect(
      client.get("/path", { whatsappNumber: "+33612345678" }),
    ).rejects.toMatchObject({ code: "BACKEND_UNREACHABLE" });
  });

  it("returns a BackendError instance for error cases", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(500, {}));
    const client = createBackendClient(config, silentLogger);
    const err = await client
      .get("/path", { whatsappNumber: "+33612345678" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BackendError);
  });

  it("sends the 3 required headers with a valid UUID v4 request id", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse(200, {}));

    const client = createBackendClient(config, silentLogger);
    await client.get("/path", { whatsappNumber: "+33612345678" });

    const [, init] = fetchSpy.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;

    expect(headers["X-Assistant-Api-Key"]).toBe("a".repeat(32));
    expect(headers["X-Assistant-Whatsapp-Number"]).toBe("+33612345678");
    expect(headers["X-Assistant-Request-Id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("does not log the whatsapp number at info level", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, {}));

    const logged: string[] = [];
    const captureLogger = pino(
      { level: "info" },
      {
        write: (chunk: string) => {
          logged.push(chunk);
        },
      },
    );

    const client = createBackendClient(config, captureLogger);
    await client.get("/path", { whatsappNumber: "+33612345678" });

    const allLogs = logged.join("");
    expect(allLogs).not.toContain("+33612345678");
  });
});
