#!/usr/bin/env npx tsx
/**
 * Standalone Reconciliation Script
 * 
 * Runs the full pricing reconciliation pipeline:
 * 1. Analyze unpriced tokens
 * 2. Mark deprecated tokens
 * 3. Derive DEX prices where possible
 * 4. Verify pricing completeness
 * 5. Generate reconciliation summary
 */

import 'dotenv/config';
import { analyzeUnpricedTokens } from './unpriced-analyzer.js';
import { runFullReconciliation } from './pricing-reconciliation.js';

async function main() {
  console.log('='.repeat(60));
  console.log('BRIDGE PRICING RECONCILIATION');
  console.log('='.repeat(60));
  
  console.log('\n[Phase 1] Analyzing unpriced tokens...\n');
  const analysis = await analyzeUnpricedTokens(true);
  
  console.log('\n[Phase 2] Running reconciliation pipeline...\n');
  const result = await runFullReconciliation(true);
  
  console.log('\n='.repeat(60));
  console.log('FINAL RESULT');
  console.log('='.repeat(60));
  console.log(`Deprecated tokens marked: ${result.deprecatedUpdated} events`);
  console.log(`DEX-derived prices applied: ${result.dexUpdated} events`);
  console.log(`Pricing complete: ${result.pricingComplete ? 'YES' : 'NO'}`);
  if (!result.pricingComplete) {
    console.log(`Remaining unpriced: ${result.unpricedRemaining} events`);
  }
  console.log('='.repeat(60));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
