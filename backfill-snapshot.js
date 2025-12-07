/**
 * One-time script to backfill wallet snapshot for yepex user
 */
import { db } from './server/db.js';
import { players, walletSnapshots } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import { fetchWalletBalances } from './blockchain-balance-fetcher.js';

async function backfillSnapshot() {
  try {
    console.log('📸 Starting snapshot backfill for yepex...');
    
    // Get yepex player data
    const player = await db
      .select()
      .from(players)
      .where(eq(players.discordUsername, 'yepex'))
      .limit(1);
    
    if (player.length === 0) {
      console.error('❌ Player yepex not found');
      process.exit(1);
    }
    
    const yepex = player[0];
    console.log(`Found player #${yepex.id}: ${yepex.discordUsername}`);
    console.log(`Wallet: ${yepex.primaryWallet}`);
    
    if (!yepex.primaryWallet) {
      console.error('❌ No primary wallet set for yepex');
      process.exit(1);
    }
    
    // Fetch current balances from blockchain
    console.log('🔍 Fetching balances from blockchain...');
    const balances = await fetchWalletBalances(yepex.primaryWallet);
    
    console.log('Balances:', balances);
    
    // Create snapshot
    const asOfDate = new Date();
    asOfDate.setUTCHours(0, 0, 0, 0); // Midnight UTC
    
    console.log('💾 Saving snapshot to database...');
    await db.insert(walletSnapshots).values({
      playerId: yepex.id,
      wallet: yepex.primaryWallet,
      asOfDate,
      jewelBalance: balances.jewel,
      crystalBalance: balances.crystal,
      cJewelBalance: balances.cjewel  // Fixed: capital J to match schema
    }).onConflictDoNothing();
    
    console.log('✅ Snapshot saved successfully!');
    console.log(`   JEWEL: ${balances.jewel}`);
    console.log(`   CRYSTAL: ${balances.crystal}`);
    console.log(`   cJEWEL: ${balances.cjewel}`);
    console.log(`   Date: ${asOfDate.toISOString()}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error backfilling snapshot:', err);
    console.error(err.stack);
    process.exit(1);
  }
}

backfillSnapshot();
