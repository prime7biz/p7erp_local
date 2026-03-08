import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { initJobQueue } from "./jobs";

// Load environment variables from .env file
dotenv.config();

import { validateEnvironment } from './middleware/envValidation';
validateEnvironment();

import helmet from "helmet";
import cors from "cors";

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
      : [];
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, origin || true);
    } else {
      callback(new Error('CORS not allowed'), false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// Add a specific route for favicon.ico to avoid 401 errors
app.get('/favicon.ico', (req, res) => {
  // Simple orange square favicon
  const faviconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAA+SURBVFhH7c6xCQAgDEXRbJYNXCUex1mcxs38giBYqBf+fZcm1MzMzFZNv6QKBbDQtqQKBbDQtqQKBbA4ewH6OLCFCNUP2QAAAABJRU5ErkJggg==';
  const faviconBuffer = Buffer.from(faviconBase64, 'base64');
  res.set('Content-Type', 'image/png');
  res.send(faviconBuffer);
});

// Define routes that don't need authentication
const publicPaths = [
  '/',
  '/login', 
  '/register', 
  '/api/auth/login', 
  '/api/auth/register', 
  '/api/auth/logout',
  '/api/auth/demo-login',
  '/favicon.ico'
];

// This middleware will be applied after routes are registered

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // First register all routes
  const server = await registerRoutes(app);

  // Then setup Vite/static serving after routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Initialize job queue system
  initJobQueue().catch(err => {
    console.error('Failed to initialize job queue:', err);
  });

  // Start server
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
