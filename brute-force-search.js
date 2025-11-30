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

// Expected genes for Class:
// D=12 (Ninja), R1=6 (Monk), R2=1 (Knight), R3=8 (Berserker)
const expected = [12, 6, 1, 8];

console.log('Brute force search for sequence: 12, 6, 1, 8 (Ninja, Monk, Knight, Berserker)\n');

// Search all possible 4-gene sequences in the statGenes
for (let startBit = 0; startBit < 192; startBit += 4) {
  const genes = [
    extractGene(statGenes, startBit),
    extractGene(statGenes, startBit + 4),
    extractGene(statGenes, startBit + 8),
    extractGene(statGenes, startBit + 12)
  ];
  
  // Check if this matches our expected sequence
  if (genes[0] === 12 || genes[1] === 6 || genes[2] === 1 || genes[3] === 8) {
    const match = genes[0] === 12 && genes[1] === 6 && genes[2] === 1 && genes[3] === 8;
    console.log(`${match ? '✓✓✓ PERFECT MATCH' : '✓ Partial'} at bit ${startBit} (trait ${Math.floor(startBit/16)}, offset ${startBit%16}):`);
    console.log(`  Bit ${startBit}: ${genes[0]} = ${CLASS_GENES[genes[0]]}`);
    console.log(`  Bit ${startBit+4}: ${genes[1]} = ${CLASS_GENES[genes[1]]}`);
    console.log(`  Bit ${startBit+8}: ${genes[2]} = ${CLASS_GENES[genes[2]]}`);
    console.log(`  Bit ${startBit+12}: ${genes[3]} = ${CLASS_GENES[genes[3]]}`);
    if (match) {
      console.log(`\n*** CLASS GENES FOUND AT BIT OFFSET ${startBit} ***`);
      console.log(`This is trait ${Math.floor(startBit/16)}, gene position ${startBit % 16}\n`);
    }
    console.log('');
  }
}
