/**
 * Debug Settings Module
 * Shared debug configuration between server and bot
 */

let settings = {
  paymentBypass: false
};

export function getDebugSettings() {
  return settings;
}

export function setDebugSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  console.log('[DEBUG] Settings updated:', settings);
}

export function isPaymentBypassEnabled() {
  return settings.paymentBypass === true;
}
