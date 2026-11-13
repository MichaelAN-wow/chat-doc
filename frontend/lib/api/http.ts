import { connection } from "next/server";

import { MockStoreError } from "@/lib/mock/store";

export async function atRequestTime(): Promise<void> {
  await connection();
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export function fromUnknown(error: unknown): Response {
  if (error instanceof MockStoreError) {
    return jsonError(error.status, error.code, error.message);
  }
  console.error(error);
  return jsonError(500, "internal_error", "Something went wrong.");
}
