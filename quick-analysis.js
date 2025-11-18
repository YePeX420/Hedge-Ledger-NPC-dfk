import { getHeroesByOwner } from './onchain-data.js';
import { fetchPetsForWallet, mapPetsToHeroes } from './pet-data.js';
import { getAllPoolAnalytics, getHeroGardeningAssignment } from './garden-analytics.js';
import { calculateHeroYield, scoreHeroForGardening } from './garden-analyzer.js';

const WALLET_ADDRESS = '0x1a9f02011c917482345b86f2c879bce988764098';

async function quickAnalysis() {
  console.log('🔍 QUICK GARDEN ANALYSIS');
  console.log('Wallet:', WALLET_ADDRESS);
  console.log('Note: Checking first 100 heroes for demo\n');
  
  // Fetch data
  console.log('Fetching heroes...');
  const allHeroes = await getHeroesByOwner(WALLET_ADDRESS, 100);
  console.log(`✅ Got ${allHeroes.length} heroes\n`);
  
  console.log('Fetching pets...');
  const pets = await fetchPetsForWallet(WALLET_ADDRESS);
  console.log(`✅ Got ${pets.length} pets\n`);
  
  const heroToPet = mapPetsToHeroes(allHeroes.map(h => h.id), pets);
  
  console.log('Fetching pool analytics...');
  const pools = await getAllPoolAnalytics();
  console.log(`✅ Got ${pools.length} pools`);
  console.log(`Pool PIDs available: ${pools.map(p => p.pid).join(', ')}\n`);
  
  // Check for gardening assignments
  console.log('Checking heroes for active gardening assignments...\n');
  const gardeningHeroes = [];
  
  for (const hero of allHeroes) {
    const assignment = await getHeroGardeningAssignment(hero.id);
    if (assignment) {
      const pool = pools.find(p => p.pid === assignment.poolId);
      if (!pool) {
        console.log(`⚠️  Hero #${hero.id}: Pool #${assignment.poolId} not found in pool data - skipping`);
        continue;
      }
      
      const pet = heroToPet.get(hero.id);
      const heroYield = calculateHeroYield(hero, pet, pool);
      const score = scoreHeroForGardening(hero);
      
      gardeningHeroes.push({ hero, assignment, pool, pet, heroYield, score });
    }
  }
  
  console.log(`\n${'═'.repeat(75)}`);
  console.log(`🌱 ACTIVE GARDENING ASSIGNMENTS: ${gardeningHeroes.length}/${allHeroes.length} heroes checked`);
  console.log(`${'═'.repeat(75)}\n`);
  
  let totalCrystalPerDay = 0;
  let totalJewelPerDay = 0;
  
  for (const { hero, assignment, pool, pet, heroYield, score } of gardeningHeroes) {
    const geneIcon = hero.professionStr === 'Gardening' ? '🧬' : '';
    const typeIcon = assignment.isExpedition ? '🔁' : '🎯';
    const petInfo = pet ? `Pet #${pet.id} (+${pet.gatheringBonusScalar}%)` : 'No pet';
    
    // Estimate daily yield (assumes 12 quests/day at 5 stamina each)
    const questsPerDay = 12;
    const crystalPerDay = heroYield.crystalsPerQuest * questsPerDay;
    const jewelPerDay = heroYield.jewelPerQuest * questsPerDay;
    
    totalCrystalPerDay += crystalPerDay;
    totalJewelPerDay += jewelPerDay;
    
    console.log(`${typeIcon} Hero #${hero.id} ${geneIcon} → Pool #${pool.pid}: ${pool.pair}`);
    console.log(`   VIT: ${hero.vitality} | WIS: ${hero.wisdom} | Skill: ${(hero.gardening/10).toFixed(1)} | ${petInfo}`);
    console.log(`   Per Quest: ${heroYield.crystalsPerQuest.toFixed(4)} CRYSTAL + ${heroYield.jewelPerQuest.toFixed(4)} JEWEL`);
    console.log(`   Daily Est: ${crystalPerDay.toFixed(3)} CRYSTAL + ${jewelPerDay.toFixed(3)} JEWEL (${questsPerDay} quests)`);
    if (assignment.isExpedition) {
      console.log(`   📊 Expedition: ${assignment.expeditionDetails.remainingIterations} iterations left`);
    }
    console.log('');
  }
  
  if (gardeningHeroes.length > 0) {
    console.log(`${'═'.repeat(75)}`);
    console.log(`💰 DAILY TOTALS (${gardeningHeroes.length} heroes @ 12 quests/day each):`);
    console.log(`   ${totalCrystalPerDay.toFixed(2)} CRYSTAL + ${totalJewelPerDay.toFixed(2)} JEWEL per day`);
    console.log(`${'═'.repeat(75)}`);
  } else {
    console.log('  No active gardening assignments found.');
    console.log('  Try running full analysis to check all heroes.\n');
  }
}

quickAnalysis().catch(console.error);
