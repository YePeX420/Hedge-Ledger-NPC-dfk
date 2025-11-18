/**
 * Report Formatter
 * 
 * Formats garden optimization results into Discord messages.
 * Generates 3 separate messages:
 * 1. Summary - Overview of improvements
 * 2. Current Gardens - Actual current assignments
 * 3. Optimized Gardens - Recommended assignments
 */

import { formatPetSummary } from './pet-data.js';

/**
 * Format summary message (Message 1 of 3)
 * 
 * @param {Object} currentState - Current assignment analysis
 * @param {Object} optimizedState - Optimized assignments
 * @param {Object} improvement - Improvement metrics
 * @returns {string} Formatted summary message
 */
export function formatSummaryMessage(currentState, optimizedState, improvement) {
  const lines = [
    '## 🌟 GARDEN OPTIMIZATION SUMMARY',
    '',
    '**Current Performance:**',
    `• Active Heroes: ${currentState.activeGardeningHeroes}/${currentState.totalHeroes}`,
    `• Pets Equipped: ${currentState.assignments.filter(a => a.pet).length}/${currentState.totalPets}`,
    `• Total APR: ${improvement.currentAPR.toFixed(2)}%`,
    '',
    '**Optimized Performance:**',
    `• Recommended Heroes: ${optimizedState.heroesUsed}`,
    `• Pets to Equip: ${optimizedState.petsUsed}`,
    `• Total APR: ${improvement.optimizedAPR.toFixed(2)}%`,
    '',
    '**Improvement:**',
  ];
  
  if (improvement.absoluteImprovement > 0) {
    lines.push(`✅ **+${improvement.absoluteImprovement.toFixed(2)}% APR** (${improvement.percentageImprovement >= 0 ? '+' : ''}${improvement.percentageImprovement.toFixed(1)}% increase)`);
  } else if (improvement.absoluteImprovement < 0) {
    lines.push(`⚠️ **${improvement.absoluteImprovement.toFixed(2)}% APR** (${improvement.percentageImprovement.toFixed(1)}% decrease)`);
  } else {
    lines.push(`➡️ **No change** - Already optimized!`);
  }
  
  lines.push('');
  lines.push('📊 See below for detailed current vs. optimized assignments.');
  
  return lines.join('\n');
}

/**
 * Format current gardens message (Message 2 of 3)
 * 
 * @param {Object} currentState - Current assignment analysis
 * @returns {string} Formatted current gardens message
 */
export function formatCurrentGardens(currentState) {
  const lines = [
    '## 📋 CURRENT GARDEN ASSIGNMENTS',
    ''
  ];
  
  if (currentState.assignments.length === 0) {
    lines.push('*No active garden assignments detected.*');
    lines.push('');
    lines.push('This could mean:');
    lines.push('• Your heroes are not currently on gardening quests');
    lines.push('• Quest data is not yet synced on-chain');
    lines.push('• Heroes are resting/on other quests');
    return lines.join('\n');
  }
  
  lines.push(`Found ${currentState.assignments.length} active assignment(s):`);
  lines.push('');
  
  for (let i = 0; i < currentState.assignments.length; i++) {
    const assignment = currentState.assignments[i];
    const { hero, pet, pool, yield: heroYield, staminaUsed, isExpedition } = assignment;
    
    const petStr = pet ? formatPetSummary(pet) : 'No pet equipped';
    const gardeningGene = hero.professionStr === 'Gardening' ? '🧬' : '';
    const questType = isExpedition ? '🔁 Expedition' : '🎯 Quest';
    const staminaInfo = staminaUsed ? `${staminaUsed} stamina` : '5 stamina';
    
    lines.push(`**${i + 1}. Pool ${pool.pid}: ${pool.pair}** (${Number(pool.totalAPR || 0).toFixed(1)}% APR) ${questType}`);
    lines.push(`   Hero #${hero.id} ${gardeningGene} (Lvl ${hero.level}, VIT ${hero.vitality}, WIS ${hero.wisdom}, GrdSkl ${(hero.gardening / 10).toFixed(1)})`);
    lines.push(`   ${petStr}`);
    lines.push(`   Using: ${staminaInfo} per quest`);
    lines.push(`   Yield: ${heroYield.crystalsPerQuest.toFixed(4)} CRYSTAL + ${heroYield.jewelPerQuest.toFixed(4)} JEWEL per quest`);
    lines.push('');
  }
  
  lines.push(`**Total Current APR: ${currentState.totalCurrentAPR.toFixed(2)}%**`);
  
  return lines.join('\n');
}

/**
 * Format optimized gardens message (Message 3 of 3)
 * 
 * @param {Object} optimizedState - Optimized assignments
 * @returns {string} Formatted optimized gardens message
 */
export function formatOptimizedGardens(optimizedState) {
  const lines = [
    '## ✨ OPTIMIZED GARDEN ASSIGNMENTS',
    ''
  ];
  
  if (optimizedState.assignments.length === 0) {
    lines.push('*No optimization possible.*');
    lines.push('');
    lines.push('Possible reasons:');
    lines.push('• No heroes suitable for gardening');
    lines.push('• No active garden pools found');
    return lines.join('\n');
  }
  
  lines.push(`Recommended ${optimizedState.assignments.length} assignment(s) for maximum yield:`);
  lines.push('');
  
  for (let i = 0; i < optimizedState.assignments.length; i++) {
    const assignment = optimizedState.assignments[i];
    const { hero, pet, pool, yield: heroYield } = assignment;
    
    const petStr = pet 
      ? `Pet #${pet.id} ${pet.shiny ? '✨' : ''}(+${pet.gatheringBonusScalar}% ${pet.gatheringType})`
      : 'No pet (consider equipping one!)';
    
    const gardeningGene = hero.professionStr === 'Gardening' ? '🧬' : '';
    
    // Optimal stamina setpoint: 5 for Skill 0-9, can use more for Skill 10+
    const optimalStamina = (hero.gardening / 10) >= 10 ? '5-25' : '5';
    
    lines.push(`**${i + 1}. Pool ${pool.pid}: ${pool.pair}** (${Number(pool.totalAPR || 0).toFixed(1)}% APR)`);
    lines.push(`   → Hero #${hero.id} ${gardeningGene} (Lvl ${hero.level}, Score: ${hero.score})`);
    lines.push(`      Stats: VIT ${hero.vitality}, WIS ${hero.wisdom}, GrdSkl ${(hero.gardening / 10).toFixed(1)}`);
    lines.push(`   → ${petStr}`);
    lines.push(`   → **Optimal Stamina:** ${optimalStamina} per quest`);
    lines.push(`   **Expected Yield:** ${heroYield.crystalsPerQuest.toFixed(4)} CRYSTAL + ${heroYield.jewelPerQuest.toFixed(4)} JEWEL per quest`);
    lines.push('');
  }
  
  lines.push(`**Total Optimized APR: ${optimizedState.totalOptimizedAPR.toFixed(2)}%**`);
  lines.push('');
  lines.push('💡 **Optimization Tips:**');
  lines.push('• 🧬 Heroes with Gardening profession gene get 20% more tokens & faster quests');
  lines.push('• Equip gardening pets (green eggs) for additional yield bonuses');
  lines.push('• Skill 10+ heroes can use more stamina per quest for better efficiency');
  lines.push('• Focus on VIT + WIS stats for maximum gardening yields');
  
  return lines.join('\n');
}

/**
 * Split long message into chunks (Discord 2000 char limit)
 * 
 * @param {string} message - Full message
 * @param {number} maxLength - Maximum length per chunk (default: 1900)
 * @returns {Array<string>} Array of message chunks
 */
export function splitMessage(message, maxLength = 1900) {
  if (message.length <= maxLength) {
    return [message];
  }
  
  const chunks = [];
  const lines = message.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    // If adding this line would exceed limit, start new chunk
    if ((currentChunk + '\n' + line).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  
  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Generate all 3 optimization messages
 * 
 * @param {Object} currentState - Current assignment analysis
 * @param {Object} optimizedState - Optimized assignments
 * @param {Object} improvement - Improvement metrics
 * @returns {Array<string>} Array of messages (may be >3 if splitting occurs)
 */
export function generateOptimizationMessages(currentState, optimizedState, improvement) {
  const message1 = formatSummaryMessage(currentState, optimizedState, improvement);
  const message2 = formatCurrentGardens(currentState);
  const message3 = formatOptimizedGardens(optimizedState);
  
  // Split each message if needed
  const chunks1 = splitMessage(message1);
  const chunks2 = splitMessage(message2);
  const chunks3 = splitMessage(message3);
  
  return [
    ...chunks1,
    ...chunks2,
    ...chunks3
  ];
}
