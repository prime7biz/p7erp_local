export function parseIntParam(value: string, paramName: string = "id"): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    const err: any = new Error(`Invalid ${paramName}: expected a number`);
    err.status = 400;
    throw err;
  }
  return parsed;
}

export function safeErrorMessage(error: unknown, fallback: string = "Internal server error"): string {
  if (process.env.NODE_ENV === "production") {
    return fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
