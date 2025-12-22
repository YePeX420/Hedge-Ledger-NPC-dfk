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

// Export raw postgres client for cases where Drizzle has issues (e.g., BIGINT arrays)
export const rawPg = queryClient;

// Create a direct (non-pooler) connection string for raw SQL operations
// The Neon pooler caches prepared statement metadata server-side even with prepare:false
// This causes type mismatch errors when columns are modified. Using direct connection bypasses this.
function getDirectConnectionString() {
  let url = getConnectionString();
  // Convert pooler URL to direct URL by removing "-pooler" from hostname
  // e.g., ep-xxx-pooler.xxx.neon.tech -> ep-xxx.xxx.neon.tech
  const directUrl = url.replace(/-pooler\./, '.');
  if (directUrl !== url) {
    console.log('🔗 Using direct connection (non-pooler) for raw SQL operations');
  }
  return directUrl;
}

// Create a simple postgres client for raw text inserts using DIRECT connection
// This bypasses Neon pooler's server-side prepared statement caching
export const rawTextPg = postgres(getDirectConnectionString(), {
  prepare: false, // Also disable client-side prepared statements
  transform: { undefined: null },
  types: {
    // Disable automatic type parsing - treat everything as text
    bigint: postgres.BigInt,
  },
});

// Execute completely raw SQL with no type inference whatsoever
// Use this for INSERT statements where postgres.js type inference is problematic
// NOTE: Using rawPg (pooler connection) since the direct connection writes to a different Neon endpoint
export async function execRawSQL(sqlString) {
  return rawPg.unsafe(sqlString);
}

console.log('✅ Database connection initialized');
