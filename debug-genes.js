/**
 * Debug script to trace gene extraction for hero 283911
 */

const statGenes = '443792905345577883435573444901078008651685812390002810708884933276869006';

// Current extraction method
function extractGene(genesStr, bitOffset) {
  const genesBigInt = typeof genesStr === 'string' ? BigInt(genesStr) : genesStr;
  const shifted = genesBigInt >> BigInt(bitOffset);
  const masked = shifted & BigInt(0xF);
  return Number(masked);
}

// Current trait decoding (trait 0 = class)
function decodeTraitCurrent(genesStr, traitIndex) {
  const baseOffset = traitIndex * 16;
  
  return {
    d: extractGene(genesStr, baseOffset),
    r1: extractGene(genesStr, baseOffset + 4),
    r2: extractGene(genesStr, baseOffset + 8),
    r3: extractGene(genesStr, baseOffset + 12)
  };
}

// Test alternative: reversed gene order within trait
function decodeTraitReversed(genesStr, traitIndex) {
  const baseOffset = traitIndex * 16;
  
  return {
    d: extractGene(genesStr, baseOffset + 12),
    r1: extractGene(genesStr, baseOffset + 8),
    r2: extractGene(genesStr, baseOffset + 4),
    r3: extractGene(genesStr, baseOffset)
  };
}

const CLASS_GENES = [
  'Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard', 'Monk', 'Pirate',
  'Berserker', 'Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter', 'Bard', 'Dragoon'
];

console.log('Hero 283911 Gene Extraction Debug');
console.log('=================================\n');

console.log('StatGenes:', statGenes);
console.log('StatGenes as BigInt:', BigInt(statGenes).toString(16), '(hex)\n');

// Test trait 0 (Class) - Should be: D=Ninja(12), R1=Monk(6), R2=Knight(1), R3=Berserker(8)
console.log('TRAIT 0: CLASS');
console.log('Expected: D=Ninja(12), R1=Monk(6), R2=Knight(1), R3=Berserker(8)\n');

const classCurrent = decodeTraitCurrent(statGenes, 0);
console.log('Current extraction (D at bit 0):');
console.log(`  D:  ${classCurrent.d} = ${CLASS_GENES[classCurrent.d]}`);
console.log(`  R1: ${classCurrent.r1} = ${CLASS_GENES[classCurrent.r1]}`);
console.log(`  R2: ${classCurrent.r2} = ${CLASS_GENES[classCurrent.r2]}`);
console.log(`  R3: ${classCurrent.r3} = ${CLASS_GENES[classCurrent.r3]}`);

const classReversed = decodeTraitReversed(statGenes, 0);
console.log('\nReversed extraction (D at bit 12):');
console.log(`  D:  ${classReversed.d} = ${CLASS_GENES[classReversed.d]}`);
console.log(`  R1: ${classReversed.r1} = ${CLASS_GENES[classReversed.r1]}`);
console.log(`  R2: ${classReversed.r2} = ${CLASS_GENES[classReversed.r2]}`);
console.log(`  R3: ${classReversed.r3} = ${CLASS_GENES[classReversed.r3]}`);

// Extract first 16 bits manually to see the raw values
console.log('\n--- Manual bit extraction for first 16 bits ---');
const genesBigInt = BigInt(statGenes);
for (let i = 0; i < 16; i += 4) {
  const val = Number((genesBigInt >> BigInt(i)) & BigInt(0xF));
  console.log(`Bits ${i}-${i+3}: ${val} = ${CLASS_GENES[val]}`);
}

// Test all 12 stat traits
console.log('\n\n--- ALL STAT TRAITS (Current Method) ---');
const traitNames = ['class', 'subClass', 'profession', 'passive1', 'passive2', 'active1', 'active2', 'statBoost1', 'statBoost2', 'element', 'statsUnknown1', 'statsUnknown2'];
for (let i = 0; i < 12; i++) {
  const genes = decodeTraitCurrent(statGenes, i);
  console.log(`Trait ${i} (${traitNames[i]}): D=${genes.d}, R1=${genes.r1}, R2=${genes.r2}, R3=${genes.r3}`);
}

console.log('\n\n--- ALL STAT TRAITS (Reversed Method) ---');
for (let i = 0; i < 12; i++) {
  const genes = decodeTraitReversed(statGenes, i);
  console.log(`Trait ${i} (${traitNames[i]}): D=${genes.d}, R1=${genes.r1}, R2=${genes.r2}, R3=${genes.r3}`);
}
