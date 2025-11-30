/**
 * Test different trait orderings to find the correct one
 */

const statGenes = '443792905345577883435573444901078008651685812390002810708884933276869006';

function extractGene(genesStr, bitOffset) {
  const genesBigInt = BigInt(genesStr);
  const shifted = genesBigInt >> BigInt(bitOffset);
  return Number(shifted & BigInt(0xF));
}

function decodeTrait(genesStr, traitIndex) {
  const baseOffset = traitIndex * 16;
  return {
    d: extractGene(genesStr, baseOffset),
    r1: extractGene(genesStr, baseOffset + 4),
    r2: extractGene(genesStr, baseOffset + 8),
    r3: extractGene(genesStr, baseOffset + 12)
  };
}

const CLASS_GENES = [
  'Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard', 'Monk', 'Pirate',
  'Berserker', 'Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter', 'Bard', 'Dragoon'
];

// Expected for hero 283911:
// Class: D=Ninja(12), R1=Monk(6), R2=Knight(1), R3=Berserker(8)
// SubClass: D=Seer(9), R1=Berserker(8), R2=Monk(6), R3=Archer(3)

console.log('Testing which trait index contains the correct class genes...\n');

for (let traitIndex = 0; traitIndex < 12; traitIndex++) {
  const genes = decodeTrait(statGenes, traitIndex);
  
  // Check if this matches the expected class genes
  if (genes.d === 12 || genes.r1 === 6 || genes.r2 === 1 || genes.r3 === 8) {
    console.log(`✓ Trait ${traitIndex} MATCHES class genes:`);
    console.log(`  D:  ${genes.d} = ${CLASS_GENES[genes.d]}`);
    console.log(`  R1: ${genes.r1} = ${CLASS_GENES[genes.r1]}`);
    console.log(`  R2: ${genes.r2} = ${CLASS_GENES[genes.r2]}`);
    console.log(`  R3: ${genes.r3} = ${CLASS_GENES[genes.r3]}`);
    
    if (genes.d === 12 && genes.r1 === 6 && genes.r2 === 1 && genes.r3 === 8) {
      console.log(`  *** PERFECT MATCH! Class is at trait index ${traitIndex} ***`);
    }
    console.log('');
  }
}

// Also check if D=Seer(9) appears somewhere for subclass
console.log('\nLooking for SubClass (D=Seer/9)...\n');
for (let traitIndex = 0; traitIndex < 12; traitIndex++) {
  const genes = decodeTrait(statGenes, traitIndex);
  if (genes.d === 9 || genes.r1 === 8 || genes.r2 === 6 || genes.r3 === 3) {
    console.log(`✓ Trait ${traitIndex} might be subclass:`);
    console.log(`  D:  ${genes.d} = ${CLASS_GENES[genes.d]}`);
    console.log(`  R1: ${genes.r1} = ${CLASS_GENES[genes.r1]}`);
    console.log(`  R2: ${genes.r2} = ${CLASS_GENES[genes.r2]}`);
    console.log(`  R3: ${genes.r3} = ${CLASS_GENES[genes.r3]}`);
    console.log('');
  }
}
