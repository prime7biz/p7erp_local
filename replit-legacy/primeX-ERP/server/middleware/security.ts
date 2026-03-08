import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

// Extended Express Request types for file uploads and sessions
declare global {
  namespace Express {
    interface Request {
      file?: any;
      files?: any;
      session?: any;
    }
  }
}

/**
 * Rate limiting middleware for API endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later",
    code: "RATE_LIMIT_EXCEEDED"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  message: {
    error: "Too many login attempts, please try again later",
    code: "AUTH_RATE_LIMIT_EXCEEDED"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security headers middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const url = req.url;
  if (url.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff2?|ttf|eot|ico)(\?|$)/)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://replit.com https://www.googletagmanager.com https://static.cloudflareinsights.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://www.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://www.googletagmanager.com https://region1.google-analytics.com https://static.cloudflareinsights.com https://cloudflareinsights.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  
  next();
}

/**
 * Input validation middleware factory
 */
export function validateInput(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({
          error: "Invalid input data",
          code: "VALIDATION_ERROR",
          details: result.error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      
      // Replace request body with validated data
      req.body = result.data;
      next();
    } catch (error) {
      console.error("Validation error:", error);
      return res.status(500).json({
        error: "Internal validation error",
        code: "VALIDATION_INTERNAL_ERROR"
      });
    }
  };
}

/**
 * SQL injection prevention middleware
 */
export function preventSQLInjection(req: Request, res: Response, next: NextFunction) {
  if (!req.path?.startsWith('/api/')) {
    return next();
  }
  if (req.originalUrl?.startsWith('/api/auth/')) {
    return next();
  }
  
  const sqlPatterns = [
    /((\%27)|(\'))(\s*)((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
    /((\%27)|(\'))union/i,
    /exec(\s|\+)+(s|x)p\w+/i,
    /;\s*(DROP|ALTER|TRUNCATE|CREATE)\s/i,
    /'\s*;\s*(SELECT|INSERT|UPDATE|DELETE)\s/i,
    /UNION\s+(ALL\s+)?SELECT\s/i,
    /'\s+OR\s+'[^']*'\s*=\s*'/i,
    /'\s+OR\s+1\s*=\s*1/i,
    /--\s*$/m,
  ];

  const checkValue = (value: any): boolean => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  if (checkValue(req.body) || checkValue(req.query) || checkValue(req.params)) {
    console.warn("[SECURITY] SQL injection attempt detected:", {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      body: req.body,
      query: req.query,
      params: req.params
    });
    
    return res.status(400).json({
      error: "Invalid input detected",
      code: "INVALID_INPUT"
    });
  }

  next();
}

/**
 * Audit logging middleware for security events
 */
export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * CSRF protection middleware
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for GET requests and specific API endpoints
  if (req.method === 'GET' || req.path.startsWith('/api/auth/')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({
      error: "Invalid CSRF token",
      code: "CSRF_TOKEN_INVALID"
    });
  }

  next();
}

/**
 * File upload security middleware
 */
export function secureFileUpload(req: Request, res: Response, next: NextFunction) {
  if (!req.file && !req.files) {
    return next();
  }

  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  const maxFileSize = 5 * 1024 * 1024; // 5MB

  const files = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [req.file];

  for (const file of files) {
    if (!file) continue;

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        error: "File type not allowed",
        code: "INVALID_FILE_TYPE"
      });
    }

    if (file.size > maxFileSize) {
      return res.status(400).json({
        error: "File size too large",
        code: "FILE_SIZE_EXCEEDED"
      });
    }
  }

  next();
}