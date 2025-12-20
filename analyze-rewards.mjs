import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

const REWARD_MINTED_TOPIC = '0xbb8bdf81af72aa9d540002b95d513f0b66e93d0fb4f7c6c9af5eb3f819d3e800';
const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11972dE7f66e4F7'.toLowerCase();
const JEWEL_ADDRESS = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260'.toLowerCase();

// Use lowercase to avoid checksum issues
const REWARD_CONTRACT = '0x39a06d3e1b6b1b24c477d90770f317abb4b8f928';

async function check() {
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = latestBlock - 2000;
  
  console.log('=== Querying RewardMinted from correct contract ===');
  const logs = await provider.getLogs({
    address: REWARD_CONTRACT,
    topics: [REWARD_MINTED_TOPIC],
    fromBlock,
    toBlock: latestBlock,
  });
  console.log(`Found ${logs.length} RewardMinted events`);
  
  if (logs.length > 0) {
    const iface = new ethers.Interface(['event RewardMinted(uint256 indexed questId, address indexed player, uint256 heroId, address indexed reward, uint256 amount, uint256 data)']);
    
    // Categorize by reward token
    const rewardCounts = {};
    let crystalTotal = 0n;
    let jewelTotal = 0n;
    
    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        const rewardAddr = parsed.args.reward.toLowerCase();
        rewardCounts[rewardAddr] = (rewardCounts[rewardAddr] || 0) + 1;
        
        if (rewardAddr === CRYSTAL_ADDRESS) {
          crystalTotal += parsed.args.amount;
        } else if (rewardAddr === JEWEL_ADDRESS) {
          jewelTotal += parsed.args.amount;
        }
      } catch (e) {
        continue;
      }
    }
    
    console.log('\nReward token counts:', Object.entries(rewardCounts).slice(0, 10));
    console.log('\nCRYSTAL total:', ethers.formatEther(crystalTotal));
    console.log('JEWEL total:', ethers.formatEther(jewelTotal));
    
    // Show sample with CRYSTAL or JEWEL
    let samples = 0;
    console.log('\n=== Sample CRYSTAL/JEWEL rewards ===');
    for (const log of logs) {
      if (samples >= 5) break;
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        const rewardAddr = parsed.args.reward.toLowerCase();
        if (rewardAddr === CRYSTAL_ADDRESS || rewardAddr === JEWEL_ADDRESS) {
          const symbol = rewardAddr === CRYSTAL_ADDRESS ? 'CRYSTAL' : 'JEWEL';
          console.log(`${symbol}: hero=${parsed.args.heroId} amount=${ethers.formatEther(parsed.args.amount)}`);
          samples++;
        }
      } catch (e) {
        continue;
      }
    }
  }
}

check();
