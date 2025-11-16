// server/db.js
// Shared database connection for Hedge Ledger systems
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Initialize PostgreSQL client
const queryClient = postgres(connectionString);

// Initialize Drizzle ORM
export const db = drizzle(queryClient);

console.log('✅ Database connection initialized');
