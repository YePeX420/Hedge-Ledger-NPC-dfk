/**
 * Quick test to check hero currentQuest data
 */

import { getAllHeroesByOwner } from './onchain-data.js';

async function checkQuests() {
  const testWallet = '0x1a9f02011c917482345b86f2c879bce988764098';
  
  console.log('Fetching heroes...');
  const heroes = await getAllHeroesByOwner(testWallet);
  console.log(`Got ${heroes.length} heroes\n`);
  
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
  
  const questingHeroes = heroes.filter(h => h.currentQuest && h.currentQuest !== ZERO_ADDR);
  console.log(`Heroes with currentQuest set: ${questingHeroes.length}`);
  
  if (questingHeroes.length > 0) {
    console.log('\nFirst 10 questing heroes:');
    for (const h of questingHeroes.slice(0, 10)) {
      console.log(`  Hero #${h.normalizedId || h.id}: currentQuest=${h.currentQuest}`);
    }
    
    const uniqueQuests = [...new Set(questingHeroes.map(h => h.currentQuest?.toLowerCase()))];
    console.log(`\nUnique quest addresses (${uniqueQuests.length}):`);
    uniqueQuests.forEach(q => console.log(`  ${q}`));
  }
  
  console.log('\nSample hero structure:');
  const sample = heroes[0];
  console.log('Keys:', Object.keys(sample).join(', '));
  console.log('currentQuest:', sample.currentQuest);
}

checkQuests().catch(console.error);
