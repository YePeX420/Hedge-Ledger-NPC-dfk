import { ethers } from 'ethers';

// Known Quest Core V3 event signatures
const KNOWN_EVENTS = [
  'RewardMinted(uint256,address,uint256,address,uint256,uint256)',
  'RewardMinted(uint256 indexed,address indexed,uint256,address indexed,uint256,uint256)',
  'QuestCompleted(uint256,address,uint256,(uint256,uint256,uint8,uint256[],address,uint256,uint256,uint256,uint8,uint8,uint8))',
  'QuestStarted(uint256,address,uint256,uint256)',
  'QuestCanceled(uint256,address,uint256,uint256)',
  'ExpeditionIterationProcessed(uint256,uint256,address,uint256[],uint256,uint256,uint40,uint16,uint16)',
];

console.log('=== Computing event topic hashes ===');
for (const ev of KNOWN_EVENTS) {
  console.log(ethers.id(ev), '->', ev.split('(')[0]);
}

// The topics we actually found
console.log('\n=== Actual topics from chain ===');
const foundTopics = [
  '0xdc5746df27e443efb54d93e1b78111844a3fe5efcabce72a649a9ce2ecbdf8e1',
  '0x8c82ebbd897ceec72ca76e44feae8fee590ce9b9a359c1a8c972164b7af56307',
  '0x9c39d9087162b6ffb6a639ad9d9134db96598a684324deb4a05a8cc57fcd7c0e',
  '0x882393444b89e79f7729aafd9796414723d7ef2b7be1dc26cf5a235d21f26a51',
  '0x2a42bf48933e06d6dfaaa7ee0324c8d7d8f354f885c135ce884388b0ee3acf8e',
  '0xa630d0fa78162b4609ebc666671f53f12a76f591639b35cd0db031ce03ef89d0',
  '0xbb8bdf81af72aa9d540002b95d513f0b66e93d0fb4f7c6c9af5eb3f819d3e800',
];

// Known DFK event names (from various sources)
const KNOWN_TOPIC_MAP = {
  '0xdc5746df27e443efb54d93e1b78111844a3fe5efcabce72a649a9ce2ecbdf8e1': 'QuestXP',
  '0x8c82ebbd897ceec72ca76e44feae8fee590ce9b9a359c1a8c972164b7af56307': 'QuestSkillUp',
  '0x9c39d9087162b6ffb6a639ad9d9134db96598a684324deb4a05a8cc57fcd7c0e': 'QuestStaminaSpent',
  '0x882393444b89e79f7729aafd9796414723d7ef2b7be1dc26cf5a235d21f26a51': 'QuestCompleted',
  '0xa630d0fa78162b4609ebc666671f53f12a76f591639b35cd0db031ce03ef89d0': 'ExpeditionIterationProcessed',
  '0xbb8bdf81af72aa9d540002b95d513f0b66e93d0fb4f7c6c9af5eb3f819d3e800': 'RewardMinted',
};

for (const topic of foundTopics) {
  console.log(topic, '->', KNOWN_TOPIC_MAP[topic] || 'unknown');
}

// Let's compute the actual RewardMinted topic hash with indexed params
console.log('\n=== RewardMinted topic computation ===');
console.log('Without indexed:', ethers.id('RewardMinted(uint256,address,uint256,address,uint256,uint256)'));
