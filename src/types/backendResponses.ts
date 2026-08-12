import { z } from "zod";

export const todayScheduleResponseSchema = z.object({
  date: z.string(),
  items: z.array(
    z.object({
      sessionId: z.number(),
      startTime: z.string(),
      endTime: z.string(),
      patientName: z.string(),
      type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
      status: z.enum([
        "SCHEDULED",
        "COMPLETED",
        "CANCELED",
        "MISSED",
        "UNBILLABLE",
      ]),
    }),
  ),
});

export type TodayScheduleResponse = z.infer<typeof todayScheduleResponseSchema>;

export const availableSlotsResponseSchema = z.object({
  date: z.string(),
  slotDurationMinutes: z.number(),
  coveredByAbsence: z.boolean(),
  isWorkingDay: z.boolean(),
  slots: z.array(
    z.object({
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
});

export type AvailableSlotsResponse = z.infer<
  typeof availableSlotsResponseSchema
>;

export const patientMatchResponseSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
});

export const patientSearchResponseSchema = z.array(patientMatchResponseSchema);

export type PatientSearchResponse = z.infer<typeof patientSearchResponseSchema>;

export const sessionConflictCheckResponseSchema = z.object({
  hasConflict: z.boolean(),
  reason: z
    .enum(["EXISTING_SESSION", "ACTIVE_RECURRING_SLOT", "FUTURE_PUNCTUAL_SESSION"])
    .nullable(),
});

export type SessionConflictCheckResponse = z.infer<
  typeof sessionConflictCheckResponseSchema
>;

export const assistantSessionResponseSchema = z.object({
  id: z.number(),
  patientName: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
  status: z.enum([
    "SCHEDULED",
    "COMPLETED",
    "CANCELED",
    "BLOCKED",
    "MISSED",
    "UNBILLABLE",
  ]),
  isRecurring: z.boolean(),
});

export type AssistantSessionResponse = z.infer<
  typeof assistantSessionResponseSchema
>;

export const sessionSearchResultSchema = z.object({
  sessionId: z.number().nullable(),
  recurringSlotId: z.number().nullable().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
  status: z.string(),
});

export const sessionSearchResponseSchema = z.array(sessionSearchResultSchema);

export type SessionSearchResponse = z.infer<typeof sessionSearchResponseSchema>;

export const sessionMoveResponseSchema = z.object({
  sessionId: z.number(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(["OFFICE_SESSION", "TELEPHONE_SESSION"]),
  status: z.string(),
});

export type SessionMoveResponse = z.infer<typeof sessionMoveResponseSchema>;
