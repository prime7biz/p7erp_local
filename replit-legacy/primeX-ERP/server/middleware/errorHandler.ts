import { Request, Response, NextFunction } from 'express';
import { ERPError } from '../services/transactionSafetyService';
import { TenantScopeError } from '../utils/tenantScope';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import crypto from 'crypto';

export function globalErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const traceId = (req as any).traceId || crypto.randomUUID();
  
  if (err instanceof ERPError) {
    return res.status(err.httpStatus).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      traceId,
    });
  }

  if (err instanceof TenantScopeError) {
    return res.status(err.statusCode).json({
      success: false,
      code: 'TENANT_SCOPE_ERROR',
      message: err.message,
      traceId,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: fromZodError(err).message,
      traceId,
    });
  }

  const isProd = process.env.NODE_ENV === 'production';
  console.error(`[ERROR] traceId=${traceId}`, isProd ? err.message : err);

  return res.status(err.status || err.statusCode || 500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: isProd ? 'An internal error occurred' : err.message,
    traceId,
  });
}
