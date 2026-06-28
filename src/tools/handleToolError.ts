import type { Logger } from "../lib/logger.js";
import { BackendError } from "../lib/errors.js";

export type ToolErrorResult = {
  content: { type: "text"; text: string }[];
  isError: true;
};

export const handleToolError = (
  err: unknown,
  logger: Logger,
): ToolErrorResult => {
  if (err instanceof BackendError) {
    logger.warn(
      { code: err.code, requestId: err.requestId },
      "tool returned backend error",
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: { code: err.code, message: err.message },
          }),
        },
      ],
      isError: true,
    };
  }
  logger.error({ err }, "tool unexpected error");
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: { code: "UNKNOWN", message: "Erreur interne" },
        }),
      },
    ],
    isError: true,
  };
};
