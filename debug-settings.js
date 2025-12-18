// debug-settings.js

// Environment detection - NEVER allow bypass in production
function isProductionEnvironment() {
  const replitDeployment = process.env.REPLIT_DEPLOYMENT;
  const nodeEnv = process.env.NODE_ENV;
  return !!(replitDeployment && replitDeployment !== '0' && replitDeployment !== 'false') || 
         nodeEnv === 'production';
}

// In-memory debug settings (process-lifetime only)
// When ALLOW_OAUTH_BYPASS env var is set AND not in production, auto-enable OAuth bypass on startup
let settings = {
  paymentBypass: false,
  verboseLogging: false,
  oauthBypass: !isProductionEnvironment() && !!process.env.ALLOW_OAUTH_BYPASS,
};

export function getDebugSettings() {
  return settings;
}

/**
 * Merge partial settings into current settings.
 * Example: setDebugSettings({ paymentBypass: true })
 */
export function setDebugSettings(partial) {
  settings = {
    ...settings,
    ...partial,
  };
}

/**
 * Convenience helper for bypass flag.
 */
export function isPaymentBypassEnabled() {
  return !!settings.paymentBypass;
}

/**
 * Convenience helper for verbose logging flag.
 */
export function isVerboseLoggingEnabled() {
  return !!settings.verboseLogging;
}

/**
 * Convenience helper for OAuth bypass flag.
 * Only returns true if:
 * 1. NOT in production environment
 * 2. ALLOW_OAUTH_BYPASS env var is set
 * 3. oauthBypass setting is true
 */
export function isOAuthBypassEnabled() {
  // NEVER allow OAuth bypass in production - security critical
  if (isProductionEnvironment()) {
    return false;
  }
  // Only allow OAuth bypass if explicitly permitted via environment variable
  if (!process.env.ALLOW_OAUTH_BYPASS) {
    return false;
  }
  return !!settings.oauthBypass;
}

/**
 * Check if OAuth bypass is allowed by environment.
 * Returns false in production regardless of env var.
 */
export function isOAuthBypassAllowed() {
  // NEVER allow in production
  if (isProductionEnvironment()) {
    return false;
  }
  return !!process.env.ALLOW_OAUTH_BYPASS;
}
