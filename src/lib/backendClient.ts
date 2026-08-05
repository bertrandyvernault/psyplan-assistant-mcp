import { randomUUID } from "node:crypto";
import type { Logger } from "./logger.js";
import type { Config } from "./config.js";
import { BackendError, mapBackendError } from "./errors.js";

export type BackendCallContext = {
  whatsappNumber: string;
};

export type BackendClient = {
  get: <T>(path: string, ctx: BackendCallContext) => Promise<T>;
  post: <T>(path: string, body: unknown, ctx: BackendCallContext) => Promise<T>;
};

export const createBackendClient = (
  config: Config,
  logger: Logger,
): BackendClient => {
  const request = async <T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    ctx: BackendCallContext,
  ): Promise<T> => {
    const requestId = randomUUID();
    const url = `${config.PSYPLAN_BACKEND_URL}${path}`;
    const start = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.BACKEND_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Assistant-Api-Key": config.PSYPLAN_BACKEND_ASSISTANT_API_KEY,
          "X-Assistant-Whatsapp-Number": ctx.whatsappNumber,
          "X-Assistant-Request-Id": requestId,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const durationMs = Date.now() - start;
      logger.info(
        { requestId, path, status: response.status, durationMs },
        "backend call completed",
      );

      if (!response.ok) {
        const responseBody = (await response
          .json()
          .catch(() => ({}))) as Record<string, unknown>;
        throw mapBackendError(response.status, responseBody, requestId);
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof BackendError) throw err;
      logger.error({ requestId, path, err }, "backend call failed");
      throw new BackendError(
        "BACKEND_UNREACHABLE",
        "Le backend est injoignable",
        requestId,
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const get = <T>(path: string, ctx: BackendCallContext): Promise<T> =>
    request<T>("GET", path, undefined, ctx);

  const post = <T>(
    path: string,
    body: unknown,
    ctx: BackendCallContext,
  ): Promise<T> => request<T>("POST", path, body, ctx);

  return { get, post };
};
