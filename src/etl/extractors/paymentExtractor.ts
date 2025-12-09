// src/etl/extractors/paymentExtractor.ts
// Extracts payment/donation data for ETL pipeline

import { db } from '../../../server/db.js';
import { payments } from '../../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import type { ExtractedPaymentData, WalletContext } from '../types.js';

export async function extractPaymentData(ctx: WalletContext): Promise<ExtractedPaymentData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const result = await db
      .select({
        totalAmount: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
      })
      .from(payments)
      .where(eq(payments.wallet, wallet));
    
    const jewelSentToHedge = parseFloat(result[0]?.totalAmount || '0');
    
    return {
      jewelSentToHedge,
    };
  } catch (err) {
    console.error(`[PaymentExtractor] Error extracting payment data for ${wallet}:`, err);
    return {
      jewelSentToHedge: 0,
    };
  }
}
