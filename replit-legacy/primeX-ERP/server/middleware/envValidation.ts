export function validateEnvironment(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const required = ['DATABASE_URL'];
  
  if (isProd) {
    required.push('JWT_SECRET');
  }
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`[STARTUP] Missing required environment variables: ${missing.join(', ')}`);
    if (isProd) {
      process.exit(1);
    }
  }
  
  // Warn about defaults in production
  if (isProd) {
    if (!process.env.CORS_ORIGIN) {
      console.warn('[STARTUP] CORS_ORIGIN not set, defaulting to same-origin');
    }
  }
  
  console.log(`[STARTUP] Environment validated (${isProd ? 'production' : 'development'})`);
}
