import { z } from "zod";

const configSchema = z.object({
  PSYPLAN_BACKEND_URL: z.string().url(),
  PSYPLAN_BACKEND_ASSISTANT_API_KEY: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  BACKEND_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type Config = z.infer<typeof configSchema>;

export const loadConfig = (): Config => {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }
  return result.data;
};
