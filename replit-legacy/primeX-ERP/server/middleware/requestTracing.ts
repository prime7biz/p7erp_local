import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestTracing(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  (req as any).traceId = traceId;
  res.setHeader('X-Request-Id', traceId);
  res.setHeader('X-Trace-Id', traceId);
  
  const start = Date.now();
  const originalEnd = res.end;
  
  res.end = function(...args: any[]) {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      traceId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      tenantId: (req as any).tenantId || null,
      userId: (req as any).userId || null,
    };
    
    // Structured log (JSON)
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(logEntry));
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify(logEntry));
    }
    // Skip verbose logging for normal requests to reduce noise
    
    return originalEnd.apply(res, args as any);
  } as any;
  
  next();
}

// Redact sensitive headers for logging
export function redactHeaders(headers: Record<string, any>): Record<string, any> {
  const redacted = { ...headers };
  const sensitiveKeys = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
  for (const key of sensitiveKeys) {
    if (redacted[key]) redacted[key] = '[REDACTED]';
  }
  return redacted;
}
