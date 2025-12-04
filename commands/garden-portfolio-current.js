import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner, getGardenPoolByPid, getUserGardenPositions } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { getCrystalPrice, getJewelPrice, getBatchPrices, TOKEN_ADDRESSES } from '../price-feed.js';
import { getLPTokenDetails } from '../garden-analytics.js';
import { isHeroRapidRenewalActive } from '../rapid-renewal-service.js';
import { getExpeditionPairs } from '../hero-pairing.js';
import { groupHeroesByGardenPool } from '../garden-pairs.js';

const GARDEN_POOLS = [
  { pid: 0, name: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d', tokens: ['JEWEL', 'xJEWEL'] },
  { pid: 1, name: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E', tokens: ['CRYSTAL', 'AVAX'] },
  { pid: 2, name: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386', tokens: ['CRYSTAL', 'JEWEL'] },
  { pid: 3, name: 'CRYSTAL-USDC', lpToken: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926', tokens: ['CRYSTAL', 'USDC'] },
  { pid: 4, name: 'ETH-USDC', lpToken: '0x7d4daa9eB74264b082A92F3f559ff167224484aC', tokens: ['ETH', 'USDC'] },
  { pid: 5, name: 'wJEWEL-USDC', lpToken: '0xCF329b34049033dE26e4449aeBCb41f1992724D3', tokens: ['JEWEL', 'USDC'] },
  { pid: 6, name: 'CRYSTAL-ETH', lpToken: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD', tokens: ['CRYSTAL', 'ETH'] },
  { pid: 7, name: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD', tokens: ['CRYSTAL', 'BTC'] },
  { pid: 8, name: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320', tokens: ['CRYSTAL', 'KAIA'] },
  { pid: 9, name: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE', tokens: ['JEWEL', 'KAIA'] },
  { pid: 10, name: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98', tokens: ['JEWEL', 'AVAX'] },
  { pid: 11, name: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B', tokens: ['JEWEL', 'BTC'] },
  { pid: 12, name: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B', tokens: ['JEWEL', 'ETH'] },
  { pid: 13, name: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', tokens: ['BTC', 'USDC'] }
];

const POWER_SURGE_IDS = [90, 170];
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166];

function calculateHeroFactor(hero, additionalGrdSkill = 0) {
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  const rawGrdSkill = (hero.gardening || 0) / 10;
  const GrdSkl = rawGrdSkill + additionalGrdSkill;
  return 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
}

function getPetGardenSkillType(pet) {
  if (!pet || pet.eggType !== 2) return null;
  const bonusId = pet.gatheringBonus;
  if (POWER_SURGE_IDS.includes(bonusId)) {
    return { type: 'power_surge', bonus: pet.gatheringBonusScalar };
  }
  if (SKILLED_GREENSKEEPER_IDS.includes(bonusId)) {
    return { type: 'skilled_greenskeeper', bonus: pet.gatheringBonusScalar };
  }
  return null;
}

function buildHeroData(hero, pet, hasRR, stamina) {
  let heroFactor = calculateHeroFactor(hero);
  let petMultiplier = 1.0;
  let petBonus = 0;
  let skillType = 'none';
  
  if (pet) {
    const skillInfo = getPetGardenSkillType(pet);
    if (skillInfo) {
      if (skillInfo.type === 'power_surge') {
        petMultiplier = 1 + skillInfo.bonus / 100;
      } else if (skillInfo.type === 'skilled_greenskeeper') {
        heroFactor = calculateHeroFactor(hero, skillInfo.bonus / 10);
      }
      petBonus = skillInfo.bonus;
      skillType = skillInfo.type;
    }
  }
  
  const hasGardeningGene = hero.professionStr === 'Gardening';
  const gardeningSkill = hero.gardening || 0;
  const grdSkillForFormula = gardeningSkill / 10;
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  const geneBonus = hasGardeningGene ? 1 : 0;
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  const questMinPerStam = hasGardeningGene ? 10 : 12;
  let regenMinPerStam = 20;
  if (hasRR) {
    const regenSeconds = Math.max(300, 1200 - (hero.level * 3));
    regenMinPerStam = regenSeconds / 60;
  }
  const cycleMinutes = stamina * (questMinPerStam + regenMinPerStam);
  const runsPerDay = 1440 / cycleMinutes;
  
  return {
    hero,
    pet,
    heroFactor,
    petMultiplier,
    petBonus,
    skillType,
    hasGardeningGene,
    gardeningSkill,
    divisor,
    runsPerDay,
    hasRR
  };
}

function scoreHeroForPool(heroData, pool, rewardFund, lpShare, stamina) {
  const crystalPerRun = (rewardFund.crystalPool * pool.allocDecimal * lpShare * heroData.heroFactor * heroData.petMultiplier * stamina) / heroData.divisor;
  const jewelPerRun = (rewardFund.jewelPool * pool.allocDecimal * lpShare * heroData.heroFactor * heroData.petMultiplier * stamina) / heroData.divisor;
  return { crystalPerRun, jewelPerRun };
}

async function getAllPoolsData() {
  const pools = [];
  const cached = getCachedPoolAnalytics();
  const cachedData = cached?.data || [];
  
  for (const poolInfo of GARDEN_POOLS) {
    try {
      const poolDetails = await getGardenPoolByPid(poolInfo.pid, 'dfk');
      if (!poolDetails) continue;
      
      const totalStakedRaw = poolDetails.totalStakedRaw;
      if (!totalStakedRaw || BigInt(totalStakedRaw) <= 0n) continue;
      
      const analytics = cachedData.find(p => p.pid === poolInfo.pid);
      const tvl = analytics?.totalTVL || 0;
      const allocPercent = parseFloat(poolDetails.allocPercent) || 0;
      
      pools.push({
        pid: poolInfo.pid,
        name: poolInfo.name,
        lpToken: poolInfo.lpToken,
        tokens: poolInfo.tokens,
        totalStakedRaw,
        totalStaked: poolDetails.totalStaked,
        tvl,
        allocPercent,
        allocDecimal: allocPercent / 100
      });
    } catch (err) {
      console.error(`[GardenPortfolioCurrent] Error getting pool ${poolInfo.pid}:`, err.message);
    }
  }
  
  return pools;
}

async function getTokenPrices() {
  try {
    const [crystalPrice, jewelPrice] = await Promise.all([
      getCrystalPrice(),
      getJewelPrice()
    ]);
    
    const batchPrices = await getBatchPrices([
      TOKEN_ADDRESSES.USDC,
      TOKEN_ADDRESSES.WETH,
      TOKEN_ADDRESSES.WAVAX
    ]);
    
    const prices = {
      CRYSTAL: crystalPrice || 0,
      JEWEL: jewelPrice || 0,
      USDC: batchPrices.get(TOKEN_ADDRESSES.USDC.toLowerCase()) || 1.0,
      ETH: batchPrices.get(TOKEN_ADDRESSES.WETH.toLowerCase()) || 0,
      AVAX: batchPrices.get(TOKEN_ADDRESSES.WAVAX.toLowerCase()) || 0,
      BTC: 0,
      KAIA: 0,
      xJEWEL: 0
    };
    
    try {
      const btcUsdcLP = '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5';
      const btcDetails = await getLPTokenDetails(btcUsdcLP);
      if (btcDetails) {
        const dec0 = Number(btcDetails.token0.decimals);
        const dec1 = Number(btcDetails.token1.decimals);
        const r0 = parseFloat(btcDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(btcDetails.reserve1.toString()) / Math.pow(10, dec1);
        if (btcDetails.token0.symbol.includes('USDC')) {
          prices.BTC = r0 / r1;
        } else {
          prices.BTC = r1 / r0;
        }
      }
    } catch (e) {}
    
    try {
      const crystalKaiaLP = '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320';
      const kaiaDetails = await getLPTokenDetails(crystalKaiaLP);
      if (kaiaDetails && prices.CRYSTAL > 0) {
        const dec0 = Number(kaiaDetails.token0.decimals);
        const dec1 = Number(kaiaDetails.token1.decimals);
        const r0 = parseFloat(kaiaDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(kaiaDetails.reserve1.toString()) / Math.pow(10, dec1);
        const sym0 = kaiaDetails.token0.symbol.toUpperCase();
        if (sym0.includes('CRYSTAL')) {
          prices.KAIA = prices.CRYSTAL * (r0 / r1);
        } else {
          prices.KAIA = prices.CRYSTAL * (r1 / r0);
        }
      }
    } catch (e) {}
    
    prices.xJEWEL = prices.JEWEL;
    return prices;
  } catch (err) {
    console.error('[GardenPortfolioCurrent] Error getting prices:', err.message);
    return {
      CRYSTAL: 0.0045,
      JEWEL: 0.0175,
      USDC: 1.0,
      ETH: 3450,
      AVAX: 42,
      BTC: 97500,
      KAIA: 0.15,
      xJEWEL: 0.0175
    };
  }
}

export const data = new SlashCommandBuilder()
  .setName('garden-portfolio-current')
  .setDescription('Show your current hero gardening positions with yields')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('stamina')
      .setDescription('Stamina per run (default: 30)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(100)
  );

export async function execute(interaction) {
  const startTime = Date.now();
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    const stamina = interaction.options.getInteger('stamina') || 30;
    
    console.log(`[GardenPortfolioCurrent] Analyzing wallet ${walletAddress}, stamina=${stamina}...`);
    
    const [heroes, pets, allPools, prices, rewardFund, existingPositions, expeditionData] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getAllPoolsData(),
      getTokenPrices(),
      getQuestRewardFundBalances(),
      getUserGardenPositions(walletAddress, 'dfk'),
      getExpeditionPairs(walletAddress)
    ]);
    
    const pools = allPools.filter(p => p.pid !== 0);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet.');
    }
    
    let gardeningPools = expeditionData?.pools || {};
    let detectionMethod = 'expedition_api';
    
    if (!expeditionData || expeditionData.pairs.length === 0) {
      console.log('[GardenPortfolioCurrent] No expedition data, falling back to currentQuest detection...');
      const poolHeroes = groupHeroesByGardenPool(heroes);
      
      if (poolHeroes.size === 0) {
        return interaction.editReply('No heroes currently gardening. Use `/garden-portfolio-3pair` to see optimal assignments.');
      }
      
      detectionMethod = 'currentQuest';
      gardeningPools = {};
      for (const [poolId, heroList] of poolHeroes.entries()) {
        const poolInfo = GARDEN_POOLS.find(p => p.pid === poolId);
        const pairs = [];
        for (let i = 0; i < heroList.length; i += 2) {
          const h1 = heroList[i];
          const h2 = heroList[i + 1];
          if (h1 && h2) {
            pairs.push({
              poolId,
              poolName: poolInfo?.name || `Pool ${poolId}`,
              heroIds: [Number(h1.normalizedId || h1.id), Number(h2.normalizedId || h2.id)]
            });
          } else if (h1) {
            pairs.push({
              poolId,
              poolName: poolInfo?.name || `Pool ${poolId}`,
              heroIds: [Number(h1.normalizedId || h1.id)]
            });
          }
        }
        if (pairs.length > 0) {
          gardeningPools[poolId] = pairs;
        }
      }
      console.log(`[GardenPortfolioCurrent] Fallback detected ${Object.keys(gardeningPools).length} pools with gardening heroes`);
    }
    
    if (Object.keys(gardeningPools).length === 0) {
      return interaction.editReply('No heroes currently gardening. Use `/garden-portfolio-3pair` to see optimal assignments.');
    }
    
    const poolsWithTVL = pools.filter(p => p.tvl > 0);
    const cacheReady = poolsWithTVL.length > 0;
    
    const heroMap = new Map();
    for (const hero of heroes) {
      const heroId = hero.normalizedId || hero.id;
      heroMap.set(Number(heroId), hero);
    }
    
    const petMap = new Map();
    for (const pet of (pets || [])) {
      if (pet.eggType === 2) {
        petMap.set(Number(pet.id), pet);
      }
    }
    
    const heroPetMap = new Map();
    for (const hero of heroes) {
      const heroId = hero.normalizedId || hero.id;
      if (hero.equippedPetId) {
        const pet = petMap.get(Number(hero.equippedPetId));
        if (pet) heroPetMap.set(Number(heroId), pet);
      }
    }
    
    const existingByPid = new Map();
    for (const pos of (existingPositions || [])) {
      existingByPid.set(pos.pid, pos);
    }
    
    const gardeningHeroIds = new Set();
    for (const poolPairs of Object.values(gardeningPools)) {
      for (const pair of poolPairs) {
        for (const heroId of pair.heroIds) {
          gardeningHeroIds.add(heroId);
        }
      }
    }
    
    const rrChecks = await Promise.all(
      [...gardeningHeroIds].map(async heroId => {
        const hasRR = await isHeroRapidRenewalActive(walletAddress, heroId);
        return [heroId, hasRR];
      })
    );
    const rrMap = new Map(rrChecks);
    
    const poolResults = [];
    const poolsNoLP = [];
    let totalDailyCrystal = 0;
    let totalDailyJewel = 0;
    let totalDailyUSD = 0;
    
    for (const [poolId, poolPairs] of Object.entries(gardeningPools)) {
      const pid = Number(poolId);
      const pool = pools.find(p => p.pid === pid);
      const poolInfo = GARDEN_POOLS.find(p => p.pid === pid);
      const poolName = poolInfo?.name || `Pool ${pid}`;
      
      const pos = existingByPid.get(pid);
      const hasLP = pos && BigInt(pos.stakedAmountRaw || 0) > 0n;
      
      if (!hasLP) {
        console.log(`[GardenPortfolioCurrent] No LP staked in pool ${pid}, still showing heroes`);
        poolsNoLP.push({
          pid,
          poolName,
          pairs: poolPairs,
          heroIds: poolPairs.flatMap(p => p.heroIds)
        });
        continue;
      }
      
      if (!pool) {
        console.log(`[GardenPortfolioCurrent] Pool ${pid} not found in pool data`);
        continue;
      }
      
      const userLPRaw = BigInt(pos.stakedAmountRaw || 0);
      const totalStakedRaw = BigInt(pool.totalStakedRaw);
      const lpShare = totalStakedRaw > 0n ? Number(userLPRaw) / Number(totalStakedRaw) : 0;
      const positionUSD = lpShare * pool.tvl;
      
      let poolDailyCrystal = 0;
      let poolDailyJewel = 0;
      const pairDetails = [];
      
      for (const pairData of poolPairs) {
        const hero1 = heroMap.get(pairData.heroIds[0]);
        const hero2 = heroMap.get(pairData.heroIds[1]);
        
        if (!hero1 || !hero2) {
          console.log(`[GardenPortfolioCurrent] Missing hero data for pair in pool ${pid}`);
          continue;
        }
        
        const pet1 = heroPetMap.get(pairData.heroIds[0]);
        const pet2 = heroPetMap.get(pairData.heroIds[1]);
        const rr1 = rrMap.get(pairData.heroIds[0]) || false;
        const rr2 = rrMap.get(pairData.heroIds[1]) || false;
        
        const h1Data = buildHeroData(hero1, pet1, rr1, stamina);
        const h2Data = buildHeroData(hero2, pet2, rr2, stamina);
        
        const pairRunsPerDay = Math.min(h1Data.runsPerDay, h2Data.runsPerDay);
        
        const h1Yield = scoreHeroForPool(h1Data, pool, rewardFund, lpShare, stamina);
        const h2Yield = scoreHeroForPool(h2Data, pool, rewardFund, lpShare, stamina);
        
        const pairCrystal = (h1Yield.crystalPerRun + h2Yield.crystalPerRun) * pairRunsPerDay;
        const pairJewel = (h1Yield.jewelPerRun + h2Yield.jewelPerRun) * pairRunsPerDay;
        
        poolDailyCrystal += pairCrystal;
        poolDailyJewel += pairJewel;
        
        pairDetails.push({
          heroes: [h1Data, h2Data],
          runsPerDay: pairRunsPerDay
        });
      }
      
      const poolDailyUSD = poolDailyCrystal * prices.CRYSTAL + poolDailyJewel * prices.JEWEL;
      const totalRunsPerDay = pairDetails.reduce((sum, p) => sum + p.runsPerDay, 0);
      
      poolResults.push({
        pool,
        pairs: pairDetails,
        positionUSD,
        lpShare,
        dailyCrystal: poolDailyCrystal,
        dailyJewel: poolDailyJewel,
        dailyUSD: poolDailyUSD,
        totalRunsPerDay,
        apr: positionUSD > 0 ? (poolDailyUSD * 365 / positionUSD * 100) : 0
      });
      
      totalDailyCrystal += poolDailyCrystal;
      totalDailyJewel += poolDailyJewel;
      totalDailyUSD += poolDailyUSD;
    }
    
    poolResults.sort((a, b) => b.dailyUSD - a.dailyUSD);
    
    const totalGardeningHeroes = gardeningHeroIds.size;
    const totalPairs = poolResults.reduce((sum, p) => sum + p.pairs.length, 0);
    
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('Current Garden Portfolio')
      .setTimestamp();
    
    let description = [
      `**Wallet:** \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
      `**Stamina:** ${stamina} | **Heroes Gardening:** ${totalGardeningHeroes} | **Pairs:** ${totalPairs}`,
      ``
    ];
    
    for (const result of poolResults) {
      const displayName = result.pool.name.replace(/wJEWEL/g, 'JEWEL');
      
      const pairLines = result.pairs.map((pair, idx) => {
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        const h1Label = `#${h1.hero.normalizedId || h1.hero.id}${h1.hasGardeningGene ? '[G]' : ''}${h1.hasRR ? '[RR]' : ''}`;
        const h2Label = `#${h2.hero.normalizedId || h2.hero.id}${h2.hasGardeningGene ? '[G]' : ''}${h2.hasRR ? '[RR]' : ''}`;
        const p1 = h1.pet ? `+${h1.petBonus}%` : '';
        const p2 = h2.pet ? `+${h2.petBonus}%` : '';
        return `  P${idx + 1}: ${h1Label}${p1} + ${h2Label}${p2} (${pair.runsPerDay.toFixed(2)} runs/day)`;
      }).join('\n');
      
      description.push(
        `**${displayName}** (PID ${result.pool.pid})`,
        `Position: $${result.positionUSD.toFixed(0)} | Share: ${(result.lpShare * 100).toFixed(2)}%`,
        `Daily: ${result.dailyCrystal.toFixed(2)} C + ${result.dailyJewel.toFixed(2)} J = $${result.dailyUSD.toFixed(2)}`,
        `APR: ${result.apr.toFixed(1)}% | Runs/day: ${result.totalRunsPerDay.toFixed(2)}`,
        `\`\`\`${pairLines}\`\`\``,
        ``
      );
    }
    
    if (poolsNoLP.length > 0) {
      description.push(`---`, `**Pools Without LP Staked:** (no yield calculation)`);
      for (const noLP of poolsNoLP) {
        const displayName = noLP.poolName.replace(/wJEWEL/g, 'JEWEL');
        const heroList = noLP.heroIds.map(id => `#${id}`).join(', ');
        description.push(`${displayName} (PID ${noLP.pid}): Heroes ${heroList}`);
      }
      description.push(``);
    }
    
    description.push(
      `---`,
      `**Portfolio Totals:**`,
      `Daily: ${totalDailyCrystal.toFixed(2)} CRYSTAL + ${totalDailyJewel.toFixed(2)} JEWEL`,
      `**Daily USD: $${totalDailyUSD.toFixed(2)}** | Weekly: $${(totalDailyUSD * 7).toFixed(2)} | Monthly: $${(totalDailyUSD * 30).toFixed(2)}`
    );
    
    if (!cacheReady) {
      description.push(``, `*Note: Pool analytics still loading - yields may be incomplete*`);
    }
    
    embed.setDescription(description.join('\n'));
    
    const assignmentLines = [];
    for (const result of poolResults) {
      const displayName = result.pool.name.replace(/wJEWEL/g, 'JEWEL');
      assignmentLines.push(`**${displayName}** (PID ${result.pool.pid}):`);
      
      for (let i = 0; i < result.pairs.length; i++) {
        const pair = result.pairs[i];
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        
        const h1Id = h1.hero.normalizedId || h1.hero.id;
        const h2Id = h2.hero.normalizedId || h2.hero.id;
        const h1Pet = h1.pet ? ` + Pet #${h1.pet.id}` : '';
        const h2Pet = h2.pet ? ` + Pet #${h2.pet.id}` : '';
        
        assignmentLines.push(`  Pair ${i + 1}: Hero #${h1Id}${h1Pet} + Hero #${h2Id}${h2Pet}`);
      }
      assignmentLines.push('');
    }
    
    for (const noLP of poolsNoLP) {
      const displayName = noLP.poolName.replace(/wJEWEL/g, 'JEWEL');
      assignmentLines.push(`**${displayName}** (PID ${noLP.pid}) [NO LP STAKED]:`);
      for (let i = 0; i < noLP.pairs.length; i++) {
        const pair = noLP.pairs[i];
        const heroStr = pair.heroIds.map(id => {
          const hero = heroMap.get(id);
          const pet = heroPetMap.get(id);
          const petStr = pet ? ` + Pet #${pet.id}` : '';
          return `Hero #${id}${petStr}`;
        }).join(' + ');
        assignmentLines.push(`  Pair ${i + 1}: ${heroStr}`);
      }
      assignmentLines.push('');
    }
    
    const assignmentEmbed = new EmbedBuilder()
      .setColor('#2196F3')
      .setTitle('Current Hero/Pet Assignments')
      .setDescription(assignmentLines.join('\n').trim() || 'No assignments');
    
    const totalPoolsWithHeroes = poolResults.length + poolsNoLP.length;
    const pricesEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Prices & Stats')
      .setDescription([
        `CRYSTAL: $${prices.CRYSTAL.toFixed(4)} | JEWEL: $${prices.JEWEL.toFixed(4)}`,
        ``,
        `**Total Heroes:** ${heroes.length} | **Gardening Pets:** ${[...petMap.values()].length}`,
        `**Pools with Gardening Heroes:** ${totalPoolsWithHeroes} (${poolsNoLP.length} without LP)`,
        `**Detection:** ${detectionMethod === 'expedition_api' ? 'Expedition API' : 'CurrentQuest fallback'}`
      ].join('\n'))
      .setFooter({ 
        text: `Runtime: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Showing current gardening state` 
      });
    
    return interaction.editReply({ embeds: [embed, assignmentEmbed, pricesEmbed] });
    
  } catch (error) {
    console.error('[GardenPortfolioCurrent] Error:', error);
    return interaction.editReply(`Error analyzing current garden portfolio: ${error.message}`);
  }
}
