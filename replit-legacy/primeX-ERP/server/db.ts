import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure the connection pool with proper error handling and reconnection
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
});

// Add error handler to prevent connection issues from crashing the app
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't crash on connection errors
});

// Create the Drizzle client
export const db = drizzle(pool, { schema });

// Helper function to execute queries with proper error handling
export async function executeQuery(queryFn: () => Promise<any>) {
  try {
    return await queryFn();
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}