#!/usr/bin/env node
import { GraphQLClient, gql } from 'graphql-request';
import { decodeHeroGenes } from './hero-genetics.js';

const heroId = process.argv[2];

if (!heroId) {
  console.log('Usage: node test-any-hero.js <HERO_ID>');
  console.log('Example: node test-any-hero.js 1564');
  process.exit(1);
}

const dfkClient = new GraphQLClient('https://api.defikingdoms.com/graphql');

const query = gql`
  query GetHero($heroId: ID!) {
    hero(id: $heroId) {
      id
      normalizedId
      network
      originRealm
      mainClassStr
      subClassStr
      professionStr
      rarity
      generation
      level
      statGenes
      visualGenes
    }
  }
`;

try {
  console.log(`\n🔍 Fetching Hero #${heroId}...\n`);
  
  const { hero } = await dfkClient.request(query, { heroId });
  
  if (!hero) {
    console.log(`❌ Hero #${heroId} not found`);
    process.exit(1);
  }
  
  const decoded = decodeHeroGenes(hero);
  
  // Discord-style output (what Hedge shows)
  console.log(`**🧬 Full Genetics for Hero ${hero.id}**`);
  console.log(`**Normalized ID:** ${hero.normalizedId || 'N/A'}`);
  console.log(`**Realm:** ${hero.network || hero.originRealm}`);
  console.log(`**Rarity:** ${['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity]} | **Gen:** ${hero.generation} | **Level:** ${hero.level}`);
  console.log('');
  
  console.log('**🎭 Class Genetics:**');
  console.log(`**Main:** D: ${decoded.mainClass.dominant} | R1: ${decoded.mainClass.R1} | R2: ${decoded.mainClass.R2} | R3: ${decoded.mainClass.R3}`);
  console.log(`**Sub:** D: ${decoded.subClass.dominant} | R1: ${decoded.subClass.R1} | R2: ${decoded.subClass.R2} | R3: ${decoded.subClass.R3}`);
  console.log('');
  
  console.log('**🌿 Profession Genetics:**');
  console.log(`D: ${decoded.profession.dominant} | R1: ${decoded.profession.R1} | R2: ${decoded.profession.R2} | R3: ${decoded.profession.R3}`);
  const hasGardening = decoded.profession.dominant === 'Gardening' || 
                      decoded.profession.R1 === 'Gardening' || 
                      decoded.profession.R2 === 'Gardening' || 
                      decoded.profession.R3 === 'Gardening';
  if (hasGardening) {
    console.log('✅ **Has Gardening Gene** - Eligible for 40% stamina reduction bonus');
  }
  console.log('');
  
  console.log('**⚡ Abilities:**');
  console.log(`**Passive1:** D: ${decoded.passive1.dominant} | R1: ${decoded.passive1.R1} | R2: ${decoded.passive1.R2} | R3: ${decoded.passive1.R3}`);
  console.log(`**Passive2:** D: ${decoded.passive2.dominant} | R1: ${decoded.passive2.R1} | R2: ${decoded.passive2.R2} | R3: ${decoded.passive2.R3}`);
  console.log(`**Active1:** D: ${decoded.active1.dominant} | R1: ${decoded.active1.R1} | R2: ${decoded.active1.R2} | R3: ${decoded.active1.R3}`);
  console.log(`**Active2:** D: ${decoded.active2.dominant} | R1: ${decoded.active2.R1} | R2: ${decoded.active2.R2} | R3: ${decoded.active2.R3}`);
  console.log('');
  
  console.log('**📈 Stat Boosts:**');
  console.log(`**Boost1:** D: ${decoded.statBoost1.dominant} | R1: ${decoded.statBoost1.R1} | R2: ${decoded.statBoost1.R2} | R3: ${decoded.statBoost1.R3}`);
  console.log(`**Boost2:** D: ${decoded.statBoost2.dominant} | R1: ${decoded.statBoost2.R1} | R2: ${decoded.statBoost2.R2} | R3: ${decoded.statBoost2.R3}`);
  console.log('');
  
  console.log('**🔥 Element:**');
  console.log(`D: ${decoded.element.dominant} | R1: ${decoded.element.R1} | R2: ${decoded.element.R2} | R3: ${decoded.element.R3}`);
  console.log('');
  
  console.log('**👤 Visual Traits:**');
  console.log(`**Gender:** ${decoded.visual.gender.dominant}`);
  console.log(`**Hair:** ${decoded.visual.hairStyle.dominant} | Color ${decoded.visual.hairColor.dominant}`);
  console.log(`**Eyes:** ${decoded.visual.eyeColor.dominant} | **Skin:** ${decoded.visual.skinColor.dominant}`);
  console.log(`**Background:** ${decoded.visual.background.dominant}`);
  
  if (decoded.visual.headAppendage && decoded.visual.headAppendage.dominant !== 'None') {
    console.log(`**Head Appendage:** ${decoded.visual.headAppendage.dominant}`);
  }
  if (decoded.visual.backAppendage && decoded.visual.backAppendage.dominant !== 'None') {
    console.log(`**Back Appendage:** ${decoded.visual.backAppendage.dominant}`);
  }
  
  // Validation footer
  console.log('\n' + '─'.repeat(70));
  console.log('📊 VALIDATION (GraphQL vs Decoder):');
  const classMatch = decoded.mainClass.dominant === hero.mainClassStr;
  const subMatch = decoded.subClass.dominant === hero.subClassStr;
  const profMatch = decoded.profession.dominant.toLowerCase() === hero.professionStr.toLowerCase();
  
  console.log(`  Class:      ${hero.mainClassStr.padEnd(12)} → ${decoded.mainClass.dominant.padEnd(12)} ${classMatch ? '✅' : '❌'}`);
  console.log(`  SubClass:   ${hero.subClassStr.padEnd(12)} → ${decoded.subClass.dominant.padEnd(12)} ${subMatch ? '✅' : '❌'}`);
  console.log(`  Profession: ${hero.professionStr.padEnd(12)} → ${decoded.profession.dominant.padEnd(12)} ${profMatch ? '✅' : '❌'}`);
  
  if (classMatch && subMatch && profMatch) {
    console.log('\n🎉 All validations passed!');
  } else {
    console.log('\n⚠️  Validation failed - check decoder');
  }
  
} catch (err) {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
}
