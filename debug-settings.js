// debug-settings.js

// In-memory debug settings (process-lifetime only)
let settings = {
  paymentBypass: false,
  verboseLogging: false,
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
