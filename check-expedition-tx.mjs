import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const QUEST_CORE_V3 = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';
const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11972dE7f66e4F7'.toLowerCase();
const JEWEL_ADDRESS = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260'.toLowerCase();

const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

const REWARD_MINTED_TOPIC = '0xbb8bdf81af72aa9d540002b95d513f0b66e93d0fb4f7c6c9af5eb3f819d3e800';
const EXPEDITION_TOPIC = '0xa630d0fa78162b4609ebc666671f53f12a76f591639b35cd0db031ce03ef89d0';
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

async function check() {
  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = latestBlock - 2000;
    
    // Find an expedition transaction
    console.log('Finding expedition events...');
    const expeditionLogs = await provider.getLogs({
      address: QUEST_CORE_V3,
      topics: [EXPEDITION_TOPIC],
      fromBlock,
      toBlock: latestBlock,
    });
    console.log(`Found ${expeditionLogs.length} expedition events`);
    
    if (expeditionLogs.length > 0) {
      const sampleTx = expeditionLogs[0].transactionHash;
      console.log(`\n=== Analyzing expedition tx: ${sampleTx} ===`);
      
      const receipt = await provider.getTransactionReceipt(sampleTx);
      console.log(`Total logs in tx: ${receipt.logs.length}`);
      
      // Check for RewardMinted events in this tx
      const rewardMintedLogs = receipt.logs.filter(l => l.topics[0] === REWARD_MINTED_TOPIC);
      console.log(`RewardMinted events in tx: ${rewardMintedLogs.length}`);
      
      // Check for CRYSTAL/JEWEL transfers
      const crystalTransfers = receipt.logs.filter(l => 
        l.address.toLowerCase() === CRYSTAL_ADDRESS && l.topics[0] === TRANSFER_TOPIC
      );
      const jewelTransfers = receipt.logs.filter(l => 
        l.address.toLowerCase() === JEWEL_ADDRESS && l.topics[0] === TRANSFER_TOPIC
      );
      console.log(`CRYSTAL transfers in tx: ${crystalTransfers.length}`);
      console.log(`JEWEL transfers in tx: ${jewelTransfers.length}`);
      
      // Decode transfers if any
      if (crystalTransfers.length > 0) {
        const iface = new ethers.Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
        for (const log of crystalTransfers) {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          console.log(`  CRYSTAL: from=${parsed.args.from.slice(0, 10)}... to=${parsed.args.to.slice(0, 10)}... amount=${ethers.formatEther(parsed.args.value)}`);
        }
      }
      
      // Show all unique event topics in this tx
      const topicCounts = {};
      for (const log of receipt.logs) {
        topicCounts[log.topics[0]] = (topicCounts[log.topics[0]] || 0) + 1;
      }
      console.log('\nEvent types in tx:', topicCounts);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
