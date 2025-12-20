import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

const REWARD_MINTED_TOPIC = '0xbb8bdf81af72aa9d540002b95d513f0b66e93d0fb4f7c6c9af5eb3f819d3e800';
const QUEST_CORE_V3 = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752'.toLowerCase();

async function check() {
  const txHash = '0x75c4bdc6e829b25079c49ef72e1a98ccb850ae854947c47eb39b7a2307884e44';
  const receipt = await provider.getTransactionReceipt(txHash);
  
  console.log('=== RewardMinted event sources ===');
  const rewardMintedLogs = receipt.logs.filter(l => l.topics[0] === REWARD_MINTED_TOPIC);
  
  const addressCounts = {};
  for (const log of rewardMintedLogs) {
    const addr = log.address.toLowerCase();
    addressCounts[addr] = (addressCounts[addr] || 0) + 1;
    
    if (!addressCounts[addr + '_logged']) {
      addressCounts[addr + '_logged'] = true;
      const isQuestCore = addr === QUEST_CORE_V3 ? 'YES' : 'NO';
      console.log(`Contract: ${log.address} (Is Quest Core V3? ${isQuestCore})`);
    }
  }
  
  console.log('\nAddress counts:', Object.fromEntries(
    Object.entries(addressCounts).filter(([k]) => !k.includes('_logged'))
  ));
  
  // Try to decode one RewardMinted event
  if (rewardMintedLogs.length > 0) {
    console.log('\n=== Decoding sample RewardMinted ===');
    const log = rewardMintedLogs[0];
    const iface = new ethers.Interface(['event RewardMinted(uint256 indexed questId, address indexed player, uint256 heroId, address indexed reward, uint256 amount, uint256 data)']);
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      console.log('questId:', Number(parsed.args.questId));
      console.log('player:', parsed.args.player);
      console.log('heroId:', Number(parsed.args.heroId));
      console.log('reward:', parsed.args.reward);
      console.log('amount:', ethers.formatEther(parsed.args.amount));
    } catch (e) {
      console.log('Decode error:', e.message);
    }
  }
}

check();
