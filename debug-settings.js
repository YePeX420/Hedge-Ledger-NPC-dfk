// debug-settings.js

// In-memory debug settings (process-lifetime only)
// When ALLOW_OAUTH_BYPASS env var is set, auto-enable OAuth bypass on startup
let settings = {
  paymentBypass: false,
  verboseLogging: false,
  oauthBypass: !!process.env.ALLOW_OAUTH_BYPASS,
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
 * Only returns true if ALLOW_OAUTH_BYPASS env var is set AND oauthBypass setting is true.
 */
export function isOAuthBypassEnabled() {
  // Only allow OAuth bypass if explicitly permitted via environment variable
  if (!process.env.ALLOW_OAUTH_BYPASS) {
    return false;
  }
  return !!settings.oauthBypass;
}

/**
 * Check if OAuth bypass is allowed by environment.
 */
export function isOAuthBypassAllowed() {
  return !!process.env.ALLOW_OAUTH_BYPASS;
}
