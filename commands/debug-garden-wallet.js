import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ethers } from 'ethers';
import lpStakingABI from '../LPStakingDiamond.json' with { type: 'json' };

// DFK Chain RPC
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

// DFK Chain garden pools (from official documentation)
const GARDEN_POOLS = [
  { pid: 0, name: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d' },
  { pid: 1, name: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E' },
  { pid: 2, name: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386' },
  { pid: 3, name: 'CRYSTAL-USDC', lpToken: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926' },
  { pid: 4, name: 'ETH-USDC', lpToken: '0x7d4daa9eB74264b082A92F3f559ff167224484aC' },
  { pid: 5, name: 'wJEWEL-USDC', lpToken: '0xCF329b34049033dE26e4449aeBCb41f1992724D3' },
  { pid: 6, name: 'CRYSTAL-ETH', lpToken: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD' },
  { pid: 7, name: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD' },
  { pid: 8, name: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320' },
  { pid: 9, name: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE' },
  { pid: 10, name: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98' },
  { pid: 11, name: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B' },
  { pid: 12, name: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B' },
  { pid: 13, name: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5' }
];

export const data = new SlashCommandBuilder()
  .setName('debug-garden-wallet')
  .setDescription('Show which garden pools a wallet is staking in')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address to check (DFK Chain)')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    
    // Validate address format
    if (!ethers.isAddress(walletAddress)) {
      return interaction.editReply('❌ Invalid wallet address format');
    }
    
    const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
    const stakingContract = new ethers.Contract(LP_STAKING_ADDRESS, lpStakingABI, provider);
    
    console.log(`[DebugGarden] Checking wallet ${walletAddress} for garden stakes...`);
    
    const stakedGardens = [];
    
    // Check each pool
    for (const pool of GARDEN_POOLS) {
      try {
        const userInfo = await stakingContract.userInfo(pool.pid, walletAddress);
        const stakedAmount = userInfo.amount;
        
        if (stakedAmount > 0n) {
          const stakedFormatted = ethers.formatUnits(stakedAmount, 18);
          stakedGardens.push({
            pid: pool.pid,
            name: pool.name,
            amount: parseFloat(stakedFormatted).toFixed(4),
            raw: stakedAmount.toString()
          });
          console.log(`[DebugGarden] PID ${pool.pid} (${pool.name}): ${stakedFormatted} LP tokens`);
        }
      } catch (err) {
        console.error(`[DebugGarden] Error checking PID ${pool.pid}:`, err.message);
      }
    }
    
    // Build response
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🌿 Garden Wallet Debug')
      .setDescription(`Checking wallet: \`${walletAddress}\``)
      .setTimestamp();
    
    if (stakedGardens.length === 0) {
      embed.addFields({
        name: 'Staked Gardens',
        value: '❌ No LP tokens staked in any garden'
      });
    } else {
      const gardenList = stakedGardens
        .map(g => `**${g.name}** (PID ${g.pid})\n└ Staked: ${g.amount} LP tokens`)
        .join('\n\n');
      
      embed.addFields(
        {
          name: `✅ Found ${stakedGardens.length} Active Garden${stakedGardens.length > 1 ? 's' : ''}`,
          value: gardenList
        },
        {
          name: 'Pool List',
          value: `Checked all ${GARDEN_POOLS.length} DFK Chain garden pools`
        }
      );
    }
    
    console.log(`[DebugGarden] Found ${stakedGardens.length} staked gardens for wallet`);
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[DebugGarden] Error:', error);
    return interaction.editReply(`❌ Error checking gardens: ${error.message}`);
  }
}
