// server/db.js
// Shared database connection for Hedge Ledger systems
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import 'dotenv/config';

function getConnectionString() {
  let url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!url) {
    throw new Error('NEON_DATABASE_URL or DATABASE_URL environment variable is required');
  }
  
  // Clean URL if it has "psql '" prefix from copy/paste
  if (url.startsWith("psql '")) {
    url = url.replace(/^psql '/, '').replace(/'$/, '');
  }
  
  return url;
}

const connectionString = getConnectionString();

// Log which database we're connecting to
const dbType = process.env.NEON_DATABASE_URL ? 'Neon' : 'Replit';
const hostMatch = connectionString.match(/@([^/:]+)/);
console.log(`🔌 Connecting to ${dbType} database: ${hostMatch ? hostMatch[1] : 'unknown host'}`);

// Initialize PostgreSQL client
const queryClient = postgres(connectionString);

// Initialize Drizzle ORM
export const db = drizzle(queryClient);

console.log('✅ Database connection initialized');
