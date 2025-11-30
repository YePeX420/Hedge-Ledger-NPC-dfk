const statGenes = '443792905345577883435573444901078008651685812390002810708884933276869006';

function extractGene(genesStr, bitOffset) {
  const genesBigInt = BigInt(genesStr);
  const shifted = genesBigInt >> BigInt(bitOffset);
  return Number(shifted & BigInt(0xF));
}

// Test: Reverse gene order (R3, R2, R1, D instead of D, R1, R2, R3)
function decodeTraitReversed(genesStr, traitIndex) {
  const baseOffset = traitIndex * 16;
  return {
    d: extractGene(genesStr, baseOffset + 12),   // D at bit 12
    r1: extractGene(genesStr, baseOffset + 8),   // R1 at bit 8
    r2: extractGene(genesStr, baseOffset + 4),   // R2 at bit 4
    r3: extractGene(genesStr, baseOffset)        // R3 at bit 0
  };
}

const CLASS_GENES = [
  'Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard', 'Monk', 'Pirate',
  'Berserker', 'Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter', 'Bard', 'Dragoon'
];

// Expected: D=Ninja(12), R1=Monk(6), R2=Knight(1), R3=Berserker(8)

console.log('Testing reversed gene order within traits...\n');

for (let i = 0; i < 12; i++) {
  const genes = decodeTraitReversed(statGenes, i);
  
  if (genes.d === 12 && genes.r1 === 6 && genes.r2 === 1 && genes.r3 === 8) {
    console.log(`✓✓✓ PERFECT MATCH at trait ${i}!`);
    console.log(`  D:  ${genes.d} = ${CLASS_GENES[genes.d]}`);
    console.log(`  R1: ${genes.r1} = ${CLASS_GENES[genes.r1]}`);
    console.log(`  R2: ${genes.r2} = ${CLASS_GENES[genes.r2]}`);
    console.log(`  R3: ${genes.r3} = ${CLASS_GENES[genes.r3]}`);
  } else if (genes.d === 12 || genes.r1 === 6 || genes.r2 === 1 || genes.r3 === 8) {
    console.log(`✓ Partial match at trait ${i}:`);
    console.log(`  D:  ${genes.d} = ${CLASS_GENES[genes.d]}`);
    console.log(`  R1: ${genes.r1} = ${CLASS_GENES[genes.r1]}`);
    console.log(`  R2: ${genes.r2} = ${CLASS_GENES[genes.r2]}`);
    console.log(`  R3: ${genes.r3} = ${CLASS_GENES[genes.r3]}`);
    console.log('');
  }
}
