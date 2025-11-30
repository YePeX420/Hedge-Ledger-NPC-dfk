import { decodeStatGenes } from './gene-decoder.js';

const statGenes = '443792905345577883435573444901078008651685812390002810708884933276869006';

console.log('Testing Hero 283911 Stat Gene Decoding\n');
console.log('Expected from GraphQL:');
console.log('  Class: Ninja');
console.log('  SubClass: Seer');
console.log('  Profession: Fishing\n');

const decoded = decodeStatGenes(statGenes);

console.log('Decoded Results:');
console.log('  Class:', decoded.class.d.name);
console.log('  SubClass:', decoded.subClass.d.name);
console.log('  Profession:', decoded.profession.d.name);

console.log('\n=== Full Class Genetics ===');
console.log(`D: ${decoded.class.d.name} (${decoded.class.d.value})`);
console.log(`R1: ${decoded.class.r1.name} (${decoded.class.r1.value})`);
console.log(`R2: ${decoded.class.r2.name} (${decoded.class.r2.value})`);
console.log(`R3: ${decoded.class.r3.name} (${decoded.class.r3.value})`);

console.log('\n=== Full Profession Genetics ===');
console.log(`D: ${decoded.profession.d.name} (${decoded.profession.d.value})`);
console.log(`R1: ${decoded.profession.r1.name} (${decoded.profession.r1.value})`);
console.log(`R2: ${decoded.profession.r2.name} (${decoded.profession.r2.value})`);
console.log(`R3: ${decoded.profession.r3.name} (${decoded.profession.r3.value})`);

console.log('\n=== All Stat Traits ===');
Object.keys(decoded).forEach(traitName => {
  const trait = decoded[traitName];
  console.log(`${traitName}: D=${trait.d.name}`);
});
