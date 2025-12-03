import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { 
  computeFeeAprWithShare, 
  getHarvestAprPct, 
  computeTotalBaseAprPct,
  getFeeDistributionExplanation 
} from '../apr-utils.js';

export const data = new SlashCommandBuilder()
  .setName('garden-apr-debug')
  .setDescription('Debug APR calculations for a garden pool with transparent math')
  .addIntegerOption(option =>
    option.setName('pid')
      .setDescription('Pool ID (0-13)')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(13)
  )
  .addNumberOption(option =>
    option.setName('user_tvl')
      .setDescription('Your staked value in USD (optional, for pool share calculation)')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  
  try {
    const pid = interaction.options.getInteger('pid');
    const userTvlUsd = interaction.options.getNumber('user_tvl');
    
    console.log(`[GardenAprDebug] Fetching APR data for PID ${pid}...`);
    
    const cache = getCachedPoolAnalytics();
    
    if (!cache || !cache.data || cache.data.length === 0) {
      return interaction.editReply('❌ Pool cache not available. Please try again in a few minutes.');
    }
    
    const pool = cache.data.find(p => p.pid === pid);
    
    if (!pool) {
      return interaction.editReply(`❌ Pool with PID ${pid} not found in cache.`);
    }
    
    const poolName = pool.pairName || `Pool ${pid}`;
    const volume24hUsd = pool.volume24hUSD || 0;
    const poolTvlUsd = typeof pool.totalTVL === 'number' ? pool.totalTVL : 0;
    
    const harvestAprRaw = parseFloat(String(pool.harvesting24hAPR || '0').replace('%', ''));
    const harvestAprPct = getHarvestAprPct({ harvestAprPctFromAnalytics: harvestAprRaw });
    
    const feeData = computeFeeAprWithShare({ 
      volume24hUsd, 
      poolTvlUsd, 
      userTvlUsd 
    });
    
    const totalBaseApr = computeTotalBaseAprPct({ 
      feeAprPct: feeData.poolAprPct, 
      harvestAprPct 
    });
    
    const cacheAge = cache.lastUpdated ? Math.floor((Date.now() - cache.lastUpdated) / 60000) : '?';
    
    const embed = new EmbedBuilder()
      .setColor('#00AA44')
      .setTitle(`📊 APR Debug: ${poolName}`)
      .setDescription(`Pool ID: ${pid} | Data age: ${cacheAge} min`)
      .setTimestamp();
    
    embed.addFields({
      name: '📈 Pool Metrics',
      value: [
        `**24h Volume:** $${volume24hUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `**Pool TVL:** $${poolTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ].join('\n'),
      inline: false
    });
    
    if (userTvlUsd !== undefined && userTvlUsd !== null) {
      embed.addFields({
        name: '👤 Your Position',
        value: [
          `**Your TVL:** $${userTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `**Pool Share:** ${feeData.share !== undefined ? (feeData.share * 100).toFixed(6) + '%' : 'N/A'}`,
          `**Your Daily Fees:** $${feeData.userFees24hUsd !== undefined ? feeData.userFees24hUsd.toFixed(4) : 'N/A'}`
        ].join('\n'),
        inline: false
      });
    }
    
    embed.addFields({
      name: '💰 Fee APR (LP share only, 0.20% of swaps)',
      value: [
        `**LP Fee Rate:** ${feeData.lpFeeRatePct.toFixed(2)}% (of 0.30% total)`,
        `**Daily Fees to LPs:** $${feeData.fees24hUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `**Fee APR:** ${feeData.poolAprPct.toFixed(4)}%`
      ].join('\n'),
      inline: false
    });
    
    embed.addFields({
      name: '🌾 Harvest APR (emissions + LP staking rewards)',
      value: [
        `**Includes:** CRYSTAL emissions + 10% power-token fee rewards`,
        `**Harvest APR:** ${harvestAprPct.toFixed(4)}%`
      ].join('\n'),
      inline: false
    });
    
    embed.addFields({
      name: '📊 Total Base APR (no questing)',
      value: [
        `**Fee APR:** ${feeData.poolAprPct.toFixed(4)}%`,
        `**Harvest APR:** ${harvestAprPct.toFixed(4)}%`,
        `**────────────**`,
        `**Total Base APR:** ${totalBaseApr.toFixed(4)}%`
      ].join('\n'),
      inline: false
    });
    
    embed.addFields({
      name: '📖 Fee Distribution Info',
      value: [
        '**Swap Fee (0.30% total):**',
        '• 0.20% → LP Providers (Fee APR)',
        '• 0.10% → Jeweler/Quest/Dev/Burn',
        '',
        '**Power Token Fees:**',
        '• 10% → LP Staking (in Harvest APR)',
        '• 30% → Quest Reward Fund',
        '• 30% → Dev Fund',
        '• 15% → Jeweler | 15% → Burn'
      ].join('\n'),
      inline: false
    });
    
    console.log(`[GardenAprDebug] Generated APR debug for ${poolName}: Fee=${feeData.poolAprPct.toFixed(2)}%, Harvest=${harvestAprPct.toFixed(2)}%, Total=${totalBaseApr.toFixed(2)}%`);
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[GardenAprDebug] Error:', error);
    return interaction.editReply(`❌ Error generating APR debug: ${error.message}`);
  }
}
