// src/etl/extractors/paymentExtractor.ts
// Extracts payment/donation data for ETL pipeline
// Note: payments table not yet implemented, returning placeholder data

import type { ExtractedPaymentData, WalletContext } from '../types.js';

export async function extractPaymentData(ctx: WalletContext): Promise<ExtractedPaymentData> {
  // Placeholder - payments table not yet implemented
  // In future, this would query the payments table for JEWEL sent to Hedge
  return {
    jewelSentToHedge: 0,
  };
}
