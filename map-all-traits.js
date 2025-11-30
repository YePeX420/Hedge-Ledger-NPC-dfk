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

// From the reference image, let's extract all the expected dominant values:
// Class: Ninja (12) - found at Trait 9 ✓
// SubClass: Seer (9) - NOT FOUND with current extraction
// Profession: Fishing (3) - found at Trait 11 ✓
// Stat Boost 1: Intelligence (2)
// Stat Boost 2: Luck (4)
// Active1: (B3) Heal (2)
// Active2: (B3) Heal (2) -- same as Active1?? Let me check the image again
// Passive1: (B5) Clear Vision (4)
// Passive2: (B1) Duelist (0)  
// Element: Earth (4)

// Let me look at the reference image more carefully for the ability numbering

// Let me just decode all 12 traits and show what we have:
console.log('=== ALL 12 TRAITS DECODED ===\n');
for (let i = 0; i < 12; i++) {
  const genes = decodeTrait(statGenes, i);
  console.log(`Trait ${String(i).padStart(2)}: D=${String(genes.d).padStart(2)}, R1=${String(genes.r1).padStart(2)}, R2=${String(genes.r2).padStart(2)}, R3=${String(genes.r3).padStart(2)}`);
}

// Now let me check if Seer (9) appears in ANY gene position
console.log('\n\nSearching for value 9 (Seer) in all gene positions:');
for (let trait = 0; trait < 12; trait++) {
  const genes = decodeTrait(statGenes, trait);
  if (genes.d === 9 || genes.r1 === 9 || genes.r2 === 9 || genes.r3 === 9) {
    console.log(`Trait ${trait}: D=${genes.d}, R1=${genes.r1}, R2=${genes.r2}, R3=${genes.r3}`);
  }
}

// Check trait 10 which has R3=9
console.log('\n✓ Trait 10 has R3=9, could this be subclass?');
console.log(`Trait 10: D=${decodeTrait(statGenes, 10).d}, R1=${decodeTrait(statGenes, 10).r1}, R2=${decodeTrait(statGenes, 10).r2}, R3=${decodeTrait(statGenes, 10).r3}`);
