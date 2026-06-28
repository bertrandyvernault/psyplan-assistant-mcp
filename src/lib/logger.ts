import pino from "pino";

export const createLogger = (level: string) => {
  return pino({
    level,
    base: { service: "psyplan-assistant-mcp" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};

export type Logger = ReturnType<typeof createLogger>;
