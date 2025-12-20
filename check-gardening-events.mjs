import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const QUEST_CORE_V3 = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';
const GARDENING_QUEST_ADDRESS = '0x6FF019415Ee105aCF2Ac52483A33F5B43eaDB8d0';

const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

// RewardMinted event signature
const REWARD_MINTED_TOPIC = ethers.id('RewardMinted(uint256,address,uint256,address,uint256,uint256)');

async function check() {
  try {
    const latestBlock = await provider.getBlockNumber();
    console.log('Latest block:', latestBlock);
    
    // Use 2000 blocks (within limit)
    const fromBlock = latestBlock - 2000;
    console.log(`\n=== Checking QUEST_CORE_V3 (${QUEST_CORE_V3}) ===`);
    
    const logsQuestCore = await provider.getLogs({
      address: QUEST_CORE_V3,
      topics: [REWARD_MINTED_TOPIC],
      fromBlock,
      toBlock: latestBlock,
    });
    console.log(`RewardMinted events in last 2k blocks: ${logsQuestCore.length}`);
    if (logsQuestCore.length > 0) {
      console.log('Sample tx:', logsQuestCore[0].transactionHash);
      // Decode first event
      const iface = new ethers.Interface(['event RewardMinted(uint256 indexed questId, address indexed player, uint256 heroId, address indexed reward, uint256 amount, uint256 data)']);
      const parsed = iface.parseLog({ topics: logsQuestCore[0].topics, data: logsQuestCore[0].data });
      console.log('Decoded: questId=', Number(parsed.args.questId), ', heroId=', Number(parsed.args.heroId), ', reward=', parsed.args.reward, ', amount=', ethers.formatEther(parsed.args.amount));
    }
    
    console.log(`\n=== Checking GARDENING_QUEST_ADDRESS (${GARDENING_QUEST_ADDRESS}) ===`);
    
    const logsGardening = await provider.getLogs({
      address: GARDENING_QUEST_ADDRESS,
      topics: [REWARD_MINTED_TOPIC],
      fromBlock,
      toBlock: latestBlock,
    });
    console.log(`RewardMinted events in last 2k blocks: ${logsGardening.length}`);
    
    console.log(`\n=== All events from GARDENING_QUEST_ADDRESS ===`);
    const allGardeningLogs = await provider.getLogs({
      address: GARDENING_QUEST_ADDRESS,
      fromBlock,
      toBlock: latestBlock,
    });
    console.log(`Total events in last 2k blocks: ${allGardeningLogs.length}`);
    
    // Check events from QUEST_CORE_V3 too
    console.log(`\n=== All events from QUEST_CORE_V3 ===`);
    const allQuestCoreLogs = await provider.getLogs({
      address: QUEST_CORE_V3,
      fromBlock,
      toBlock: latestBlock,
    });
    console.log(`Total events in last 2k blocks: ${allQuestCoreLogs.length}`);
    if (allQuestCoreLogs.length > 0) {
      const topicCounts = {};
      allQuestCoreLogs.forEach(log => {
        topicCounts[log.topics[0]] = (topicCounts[log.topics[0]] || 0) + 1;
      });
      console.log('Event topic counts:', topicCounts);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
