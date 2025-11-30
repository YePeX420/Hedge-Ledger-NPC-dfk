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

const PROFESSION_GENES = [
  'Mining', 'Gardening', 'Foraging', 'Fishing'
];

console.log('Confirmed by GraphQL API:');
console.log('- Class: Ninja (index 12)');
console.log('- Profession: Fishing (index 3)');
console.log('- SubClass: Seer (index 9)\n');

console.log('Searching for these values in statGenes...\n');

console.log('Class (D=12 Ninja):');
for (let i = 0; i < 12; i++) {
  const genes = decodeTrait(statGenes, i);
  if (genes.d === 12) {
    console.log(`  ✓ Trait ${i}: D=${genes.d} (${CLASS_GENES[genes.d]})`);
  }
}

console.log('\nProfession (D=3 Fishing):');
for (let i = 0; i < 12; i++) {
  const genes = decodeTrait(statGenes, i);
  if (genes.d === 3) {
    console.log(`  ✓ Trait ${i}: D=${genes.d} (${PROFESSION_GENES[genes.d] || 'Unknown'})`);
  }
}

console.log('\nSubClass (D=9 Seer):');
for (let i = 0; i < 12; i++) {
  const genes = decodeTrait(statGenes, i);
  if (genes.d === 9) {
    console.log(`  ✓ Trait ${i}: D=${genes.d} (${CLASS_GENES[genes.d]})`);
  }
}

console.log('\n\n=== CURRENT DECODING (assuming trait order 0-11) ===');
const assumedNames = ['class', 'subClass', 'profession', 'passive1', 'passive2', 'active1', 'active2', 'statBoost1', 'statBoost2', 'element', 'statsUnknown1', 'statsUnknown2'];
for (let i = 0; i < 12; i++) {
  const genes = decodeTrait(statGenes, i);
  console.log(`Trait ${i} (${assumedNames[i]}): D=${genes.d}, R1=${genes.r1}, R2=${genes.r2}, R3=${genes.r3}`);
}
