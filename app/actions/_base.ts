import type { ApiResponse } from '@/types/api';

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

export async function wrap<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    return { success: false, error: extractErrorMessage(e) };
  }
}
