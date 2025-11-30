const statGenes = '443792905345577883435573444901078008651685812390002810708884933276869006';

function extractGene(genesStr, bitOffset) {
  const genesBigInt = BigInt(genesStr);
  const shifted = genesBigInt >> BigInt(bitOffset);
  return Number(shifted & BigInt(0xF));
}

const CLASS_GENES = [
  'Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard', 'Monk', 'Pirate',
  'Berserker', 'Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter', 'Bard', 'Dragoon'
];

// Find where each expected value appears
console.log('Looking for Class gene values:\n');
console.log('D=12 (Ninja):');
for (let i = 0; i < 192; i += 4) {
  const val = extractGene(statGenes, i);
  if (val === 12) {
    console.log(`  Found at bit ${i} (trait ${Math.floor(i/16)}, gene pos ${(i%16)/4})`);
  }
}

console.log('\nR1=6 (Monk):');
for (let i = 0; i < 192; i += 4) {
  const val = extractGene(statGenes, i);
  if (val === 6) {
    console.log(`  Found at bit ${i} (trait ${Math.floor(i/16)}, gene pos ${(i%16)/4})`);
  }
}

console.log('\nR2=1 (Knight):');
for (let i = 0; i < 192; i += 4) {
  const val = extractGene(statGenes, i);
  if (val === 1) {
    console.log(`  Found at bit ${i} (trait ${Math.floor(i/16)}, gene pos ${(i%16)/4})`);
  }
}

console.log('\nR3=8 (Berserker):');
for (let i = 0; i < 192; i += 4) {
  const val = extractGene(statGenes, i);
  if (val === 8) {
    console.log(`  Found at bit ${i} (trait ${Math.floor(i/16)}, gene pos ${(i%16)/4})`);
  }
}

// Now let's decode all traits and show them in a table
console.log('\n\n=== ALL TRAITS DECODED (assuming D, R1, R2, R3 at offsets 0, 4, 8, 12) ===\n');
const traitNames = ['Trait0', 'Trait1', 'Trait2', 'Trait3', 'Trait4', 'Trait5', 'Trait6', 'Trait7', 'Trait8', 'Trait9', 'Trait10', 'Trait11'];
for (let trait = 0; trait < 12; trait++) {
  const d = extractGene(statGenes, trait * 16);
  const r1 = extractGene(statGenes, trait * 16 + 4);
  const r2 = extractGene(statGenes, trait * 16 + 8);
  const r3 = extractGene(statGenes, trait * 16 + 12);
  console.log(`${traitNames[trait]}: D=${d}, R1=${r1}, R2=${r2}, R3=${r3}`);
}
