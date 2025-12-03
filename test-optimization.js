/**
 * Test script for garden optimization
 * Tests pet parsing, RR detection, and before/after APR calculations
 */

import { generatePoolOptimizations, detectWalletLPPositions } from './wallet-lp-detector.js';
import { getAllHeroesByOwner } from './onchain-data.js';
import { decodeCurrentQuest, groupHeroesByGardenPool } from './garden-pairs.js';

async function testOptimization() {
  const testWallet = '0x1a9f02011c917482345b86f2c879bce988764098';
  
  console.log('=== Garden Optimization Test ===\n');
  console.log(`Testing wallet: ${testWallet}\n`);
  
  try {
    console.log('Step 1: Fetching LP positions...');
    const positions = await detectWalletLPPositions(testWallet);
    console.log(`Found ${positions.length} LP positions:`);
    positions.forEach(p => {
      console.log(`  - ${p.pairName} (pid=${p.pid}): $${parseFloat(p.userTVL || 0).toFixed(2)} TVL`);
    });
    
    console.log('\nStep 2: Fetching heroes...');
    const heroes = await getAllHeroesByOwner(testWallet);
    console.log(`Found ${heroes.length} heroes`);
    
    console.log('\nStep 3: Testing currentQuest decoder...');
    const testQuests = [
      '0x01050a0200000000000000000000000000000000',
      '0x01050a0300000000000000000000000000000000',
      '0x01050a0500000000000000000000000000000000',
      '0x01050a0c00000000000000000000000000000000',
      '0x0106010200000000000000000000000000000000',
    ];
    for (const q of testQuests) {
      const decoded = decodeCurrentQuest(q);
      console.log(`  ${q.slice(0,12)}... => ${JSON.stringify(decoded)}`);
    }
    
    console.log('\nStep 4: Detecting heroes currently gardening each pool...');
    const poolHeroes = groupHeroesByGardenPool(heroes);
    console.log(`Found ${poolHeroes.size} pools with gardening heroes:`);
    for (const [pid, heroList] of poolHeroes) {
      console.log(`  Pool ${pid}: ${heroList.length} heroes`);
      heroList.slice(0, 2).forEach(h => {
        const hero = h.hero || h;
        console.log(`    - Hero #${hero.normalizedId || hero.id} (L${hero.level}, G${((hero.gardening || 0) / 10).toFixed(1)})`);
      });
    }
    
    console.log('\nStep 5: Running full optimization...');
    const recommendations = await generatePoolOptimizations(positions, heroes, {
      hasLinkedWallet: true,
      walletAddress: testWallet
    });
    
    console.log(`\n=== RESULTS: ${recommendations.length} pools ===`);
    for (const rec of recommendations) {
      const poolInfo = rec.poolInfo || {};
      console.log(`\n--- ${poolInfo.pairName || rec.pairName} ---`);
      console.log(`TVL: $${parseFloat(poolInfo.userTVL || rec.userTVL || 0).toFixed(2)}`);
      
      const beforeAPR = rec.beforeAPR || rec.currentYield?.low || 0;
      const afterAPR = rec.afterAPR || rec.currentYield?.high || 0;
      console.log(`BEFORE: APR ${beforeAPR}%`);
      console.log(`AFTER:  APR ${afterAPR}%`);
      console.log(`GAIN:   ${(afterAPR - beforeAPR).toFixed(2)}% improvement`);
      
      if (rec.heroPairs) {
        console.log(`Optimized hero pairs:`);
        rec.heroPairs.forEach((pair, i) => {
          const jInfo = pair.jewel 
            ? `#${pair.jewel.heroId}${pair.jewel.petId ? ` +Pet(${pair.jewel.petBonusPct}%)` : ''}`
            : 'empty';
          const cInfo = pair.crystal 
            ? `#${pair.crystal.heroId}${pair.crystal.petId ? ` +Pet(${pair.crystal.petBonusPct}%)` : ''}`
            : 'empty';
          console.log(`  Pair ${i + 1}: JEWEL=${jInfo} | CRYSTAL=${cInfo}`);
        });
      }
    }
    
    console.log('\n=== Test Complete ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error(error.stack);
  }
}

testOptimization();
