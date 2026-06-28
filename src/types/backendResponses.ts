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
