import { GraphQLClient, gql } from 'graphql-request';
import { decodeHeroGenes } from './hero-genetics.js';

const heroId = '283911';
console.log(`🧬 Testing full bot integration with hero ${heroId}\n`);

const dfkClient = new GraphQLClient('https://api.defikingdoms.com/graphql');

const query = gql`
  query GetHeroExtendedGenetics($heroId: ID!) {
    hero(id: $heroId) {
      id
      normalizedId
      mainClassStr
      subClassStr
      professionStr
      statGenes
      visualGenes
    }
  }
`;

try {
  const rawData = await dfkClient.request(query, { heroId });
  const hero = rawData.hero;
  
  console.log('📊 GraphQL Response:');
  console.log(`  Class: ${hero.mainClassStr}`);
  console.log(`  SubClass: ${hero.subClassStr}`);
  console.log(`  Profession: ${hero.professionStr}\n`);
  
  const decoded = decodeHeroGenes(hero);
  
  console.log('🔬 Decoded Genetics:');
  console.log('  Class:');
  console.log(`    D: ${decoded.mainClass.dominant}`);
  console.log(`    R1: ${decoded.mainClass.R1}`);
  console.log(`    R2: ${decoded.mainClass.R2}`);
  console.log(`    R3: ${decoded.mainClass.R3}`);
  
  console.log('  SubClass:');
  console.log(`    D: ${decoded.subClass.dominant}`);
  
  console.log('  Profession:');
  console.log(`    D: ${decoded.profession.dominant}`);
  console.log(`    R1: ${decoded.profession.R1}`);
  console.log(`    R2: ${decoded.profession.R2}`);
  console.log(`    R3: ${decoded.profession.R3}`);
  
  console.log('\n✅ Verification:');
  const classMatch = decoded.mainClass.dominant === 'Ninja' && 
                     decoded.mainClass.R1 === 'Monk' && 
                     decoded.mainClass.R2 === 'Knight' && 
                     decoded.mainClass.R3 === 'Berserker';
  const subClassMatch = decoded.subClass.dominant === 'Seer';
  const professionMatch = decoded.profession.dominant === 'Fishing' && 
                         decoded.profession.R1 === 'Gardening';
  
  console.log(`  Class genetics: ${classMatch ? '✅ MATCH' : '❌ FAIL'}`);
  console.log(`  SubClass: ${subClassMatch ? '✅ MATCH' : '❌ FAIL'}`);
  console.log(`  Profession genetics: ${professionMatch ? '✅ MATCH' : '❌ FAIL'}`);
  
  if (classMatch && subClassMatch && professionMatch) {
    console.log('\n🎉 All validations passed! Bot integration is working correctly.');
  } else {
    console.log('\n❌ Some validations failed. Check the decoder.');
  }
  
} catch (err) {
  console.error('❌ Error:', err);
}
