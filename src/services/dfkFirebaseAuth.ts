// src/services/dfkFirebaseAuth.ts
// Exchanges DFK_FIREBASE_REFRESH_TOKEN for a short-lived ID token
// used to authenticate against DFK's internal APIs.

const FIREBASE_API_KEY = 'AIzaSyDan3VT-fwwsQJV7fQFgsWTv5q6op96K8g';
const TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

interface TokenCache {
  idToken: string;
  expiresAt: number; // unix ms
}

let _cache: TokenCache | null = null;
let _inflight: Promise<string> | null = null;

export async function getDfkIdToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid
  if (_cache && _cache.expiresAt - now > REFRESH_BUFFER_MS) {
    return _cache.idToken;
  }

  // Deduplicate concurrent callers
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const refreshToken = process.env.DFK_FIREBASE_REFRESH_TOKEN;
      if (!refreshToken) {
        throw new Error('DFK_FIREBASE_REFRESH_TOKEN environment variable not set');
      }

      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firebase token exchange failed (${res.status}): ${text.slice(0, 200)}`);
      }

      const json = await res.json() as {
        id_token: string;
        expires_in: string;
        refresh_token: string;
      };

      const expiresInMs = parseInt(json.expires_in, 10) * 1000;
      _cache = {
        idToken: json.id_token,
        expiresAt: Date.now() + expiresInMs,
      };

      console.log('[DfkFirebaseAuth] ID token refreshed, expires in', Math.round(expiresInMs / 60000), 'min');
      return _cache.idToken;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}
