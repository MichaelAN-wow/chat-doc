import { z } from "zod";

import { PROVIDER_IDS } from "@/lib/api/types";

export const modelRequestSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().trim().min(1).max(120),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .optional()
    .refine((value) => !value || /^https?:\/\//i.test(value), {
      message: "Base URL must start with http:// or https://",
    }),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(32000),
  topK: z.number().int().min(1).max(20),
});

export const chatRequestSchema = z.object({
  documentId: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(8000),
  modelConfigId: z.string().trim().min(1).max(80),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(16000),
      }),
    )
    .max(40)
    .optional(),
  model: modelRequestSchema,
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
