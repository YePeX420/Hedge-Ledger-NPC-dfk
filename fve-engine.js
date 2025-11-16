// fve-engine.js
// Fair Value Engine for DeFi Kingdoms heroes
// Learns trait values from actual Tavern sales and provides intrinsic + market fair values

import { GraphQLClient, gql } from 'graphql-request';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { 
  tavernSales, 
  heroSnapshots, 
  geneCatalog,
  traitWeights,
  similarityBuckets,
  trendData,
  processingLog
} from './shared/schema.ts';
import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';

const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const client = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);

// Initialize database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required for Fair Value Engine');
}

const queryClient = postgres(connectionString);
const db = drizzle(queryClient);

/**
 * Fetch Tavern sales from DFK GraphQL API
 * @param {Date} startDate - Start of date range (inclusive)
 * @param {Date} endDate - End of date range (inclusive)
 * @param {string} realm - Realm filter ('cv', 'sd', 'metis', or null for all)
 * @returns {Promise<Array>} Array of sale objects
 */
export async function fetchTavernSales(startDate, endDate, realm = null) {
  const query = gql`
    query FetchSales($startTimestamp: BigInt!, $endTimestamp: BigInt!) {
      saleAuctions(
        first: 1000
        orderBy: purchasedAt
        orderDirection: asc
        where: {
          purchasedAt_gte: $startTimestamp
          purchasedAt_lte: $endTimestamp
          open: false
        }
      ) {
        id
        seller {
          id
        }
        winner {
          id
        }
        tokenId
        purchasePrice
        purchasedAt
        tokenAddress
      }
    }
  `;

  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);

  try {
    const data = await client.request(query, {
      startTimestamp: startTimestamp.toString(),
      endTimestamp: endTimestamp.toString(),
    });

    // Map sales to our schema format
    return data.saleAuctions.map(sale => ({
      heroId: parseInt(sale.tokenId),
      realm: detectRealm(parseInt(sale.tokenId)),
      saleTimestamp: new Date(parseInt(sale.purchasedAt) * 1000),
      tokenAddress: sale.tokenAddress,
      tokenSymbol: inferTokenSymbol(sale.tokenAddress),
      priceAmount: sale.purchasePrice,
      buyerAddress: sale.winner?.id,
      sellerAddress: sale.seller?.id,
    }));
  } catch (error) {
    console.error('Error fetching Tavern sales:', error);
    throw error;
  }
}

/**
 * Fetch full hero snapshot by ID
 * @param {number} heroId - Hero ID
 * @returns {Promise<Object>} Hero snapshot data
 */
export async function fetchHeroSnapshot(heroId) {
  const query = gql`
    query GetHeroSnapshot($heroId: ID!) {
      hero(id: $heroId) {
        id
        normalizedId
        originRealm
        mainClassStr
        subClassStr
        professionStr
        rarity
        level
        summons
        maxSummons
        strength
        intelligence
        wisdom
        luck
        agility
        vitality
        dexterity
        statBoost1
        statBoost2
        passive1
        passive2
        active1
        active2
      }
    }
  `;

  try {
    const data = await client.request(query, { heroId: heroId.toString() });
    const hero = data.hero;
    
    if (!hero) {
      throw new Error(`Hero ${heroId} not found`);
    }

    // Parse gene data
    const passive1Gene = parseGeneData(hero.passive1);
    const passive2Gene = parseGeneData(hero.passive2);
    const active1Gene = parseGeneData(hero.active1);
    const active2Gene = parseGeneData(hero.active2);

    // Count advanced/elite/exalted genes
    const genes = [passive1Gene, passive2Gene, active1Gene, active2Gene];
    const geneCounts = countGenesByTier(genes);

    return {
      heroId: parseInt(hero.id),
      rarity: hero.rarity,
      mainClass: hero.mainClassStr || 'Unknown',
      subClass: hero.subClassStr || 'Unknown',
      level: hero.level || 1,
      profession: hero.professionStr || 'None',
      summonsRemaining: hero.maxSummons - hero.summons,
      maxSummons: hero.maxSummons,
      strength: hero.strength || 0,
      agility: hero.agility || 0,
      dexterity: hero.dexterity || 0,
      vitality: hero.vitality || 0,
      intelligence: hero.intelligence || 0,
      wisdom: hero.wisdom || 0,
      luck: hero.luck || 0,
      advancedGenes: geneCounts.advanced,
      eliteGenes: geneCounts.elite,
      exaltedGenes: geneCounts.exalted,
      passive1: passive1Gene,
      passive2: passive2Gene,
      active1: active1Gene,
      active2: active2Gene,
    };
  } catch (error) {
    console.error(`Error fetching hero ${heroId}:`, error);
    throw error;
  }
}

/**
 * Parse gene data from GraphQL response
 * @param {string} geneStr - Gene string from GraphQL
 * @returns {Object|null} Parsed gene object
 */
function parseGeneData(geneStr) {
  if (!geneStr || geneStr === '0' || geneStr === '') {
    return null;
  }

  // DFK gene format: "geneid_tier_name" or similar
  // This is a placeholder - actual parsing depends on DFK's gene format
  // For now, return basic structure
  return {
    geneId: geneStr,
    name: 'Unknown', // Will be enriched from catalog
    tier: inferGeneTier(geneStr) // Placeholder
  };
}

/**
 * Infer gene tier from gene ID (placeholder)
 * @param {string} geneId - Gene ID
 * @returns {string} Tier name
 */
function inferGeneTier(geneId) {
  // Placeholder - actual logic depends on DFK's gene encoding
  if (geneId.includes('exalted') || geneId.startsWith('ex')) return 'exalted';
  if (geneId.includes('elite') || geneId.startsWith('el')) return 'elite';
  if (geneId.includes('advanced') || geneId.startsWith('ad')) return 'advanced';
  return 'basic';
}

/**
 * Count genes by tier
 * @param {Array<Object>} genes - Array of gene objects
 * @returns {Object} Counts by tier
 */
function countGenesByTier(genes) {
  const counts = { basic: 0, advanced: 0, elite: 0, exalted: 0 };
  
  for (const gene of genes) {
    if (!gene) continue;
    const tier = gene.tier || 'basic';
    counts[tier] = (counts[tier] || 0) + 1;
  }
  
  return counts;
}

/**
 * Detect realm from hero ID
 * @param {number} heroId - Hero ID
 * @returns {string} Realm code
 */
function detectRealm(heroId) {
  const id = BigInt(heroId);
  if (id >= 2000000000000n) return 'metis'; // Serendale 2.0 (Klaytn)
  if (id >= 1000000000000n) return 'cv'; // Crystalvale
  return 'sd'; // Original Serendale
}

/**
 * Infer token symbol from address (placeholder)
 * @param {string} address - Token address
 * @returns {string} Token symbol
 */
function inferTokenSymbol(address) {
  // Placeholder - should maintain a mapping of known token addresses
  const knownTokens = {
    '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb': 'CRYSTAL', // Crystalvale
    '0x72Cb10C6bfA5624dD07Ef608027E366bd690048F': 'JEWEL', // Serendale
  };
  
  return knownTokens[address] || 'UNKNOWN';
}

/**
 * Ingest sales data into database
 * @param {Array} sales - Array of sale objects from fetchTavernSales
 * @param {Date} asOfDate - Processing date (previous UTC day)
 * @returns {Promise<number>} Number of sales ingested
 */
export async function ingestSales(sales, asOfDate) {
  let ingestedCount = 0;

  for (const sale of sales) {
    try {
      // Check if sale already exists
      const existing = await db
        .select()
        .from(tavernSales)
        .where(
          and(
            eq(tavernSales.heroId, sale.heroId),
            eq(tavernSales.saleTimestamp, sale.saleTimestamp)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        console.log(`Sale for hero ${sale.heroId} already exists, skipping`);
        continue;
      }

      // Fetch hero snapshot
      const snapshot = await fetchHeroSnapshot(sale.heroId);

      // Insert sale
      const [insertedSale] = await db
        .insert(tavernSales)
        .values({
          ...sale,
          asOfDate,
          isFloorHero: false, // Will be updated by floor detection
        })
        .returning();

      // Insert hero snapshot
      await db.insert(heroSnapshots).values({
        saleId: insertedSale.id,
        ...snapshot,
      });

      // Update gene catalog if new genes discovered
      await updateGeneCatalog([
        snapshot.passive1,
        snapshot.passive2,
        snapshot.active1,
        snapshot.active2,
      ].filter(g => g !== null));

      ingestedCount++;
      console.log(`Ingested sale for hero ${sale.heroId}`);
    } catch (error) {
      console.error(`Error ingesting sale for hero ${sale.heroId}:`, error);
    }
  }

  return ingestedCount;
}

/**
 * Update gene catalog with new genes
 * @param {Array<Object>} genes - Array of gene objects
 * @returns {Promise<void>}
 */
async function updateGeneCatalog(genes) {
  for (const gene of genes) {
    if (!gene || !gene.geneId) continue;

    try {
      // Check if gene exists
      const existing = await db
        .select()
        .from(geneCatalog)
        .where(eq(geneCatalog.geneId, gene.geneId))
        .limit(1);

      if (existing.length === 0) {
        // Insert new gene
        await db.insert(geneCatalog).values({
          geneId: gene.geneId,
          name: gene.name || 'Unknown',
          tier: gene.tier || 'basic',
          tags: [], // Will be curated later
        });
        console.log(`Added new gene to catalog: ${gene.geneId}`);
      }
    } catch (error) {
      console.error(`Error updating gene catalog for ${gene.geneId}:`, error);
    }
  }
}

/**
 * Get previous UTC day range (00:00:00 - 23:59:59 yesterday)
 * @returns {Object} {startDate, endDate}
 */
export function getPreviousUTCDayRange() {
  const now = new Date();
  
  // Get current UTC date at 00:00:00
  const currentUTCDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));

  // Previous day start: subtract 1 day
  const startDate = new Date(currentUTCDate);
  startDate.setUTCDate(startDate.getUTCDate() - 1);

  // Previous day end: 23:59:59.999
  const endDate = new Date(currentUTCDate);
  endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);

  return { startDate, endDate };
}

/**
 * Run daily batch processing
 * @returns {Promise<Object>} Processing results
 */
export async function runDailyBatch() {
  const { startDate, endDate } = getPreviousUTCDayRange();
  
  console.log(`\n🔄 Starting Fair Value Engine batch for ${startDate.toISOString().split('T')[0]}`);
  console.log(`   Processing sales from ${startDate.toISOString()} to ${endDate.toISOString()}`);

  // Create processing log entry
  const [logEntry] = await db
    .insert(processingLog)
    .values({
      asOfDate: startDate,
      status: 'running',
    })
    .returning();

  try {
    // Step 1: Fetch and ingest sales
    console.log('\n📥 Step 1: Fetching Tavern sales...');
    const sales = await fetchTavernSales(startDate, endDate);
    console.log(`   Found ${sales.length} sales`);

    const ingestedCount = await ingestSales(sales, startDate);
    console.log(`   Ingested ${ingestedCount} new sales`);

    // Step 2: Detect floor heroes
    console.log('\n🔍 Step 2: Detecting floor heroes...');
    const floorCount = await detectFloorHeroes(startDate);
    console.log(`   Marked ${floorCount} floor heroes for exclusion`);

    // Step 3: Learn trait weights (TODO)
    console.log('\n🧠 Step 3: Learning trait weights...');
    console.log('   [Not implemented yet]');

    // Step 4: Update similarity buckets (TODO)
    console.log('\n📊 Step 4: Updating similarity buckets...');
    console.log('   [Not implemented yet]');

    // Step 5: Generate trend data (TODO)
    console.log('\n📈 Step 5: Generating trend data...');
    console.log('   [Not implemented yet]');

    // Update processing log
    await db
      .update(processingLog)
      .set({
        completedAt: new Date(),
        status: 'completed',
        salesIngested: ingestedCount,
        floorHeroesExcluded: floorCount,
      })
      .where(eq(processingLog.id, logEntry.id));

    console.log(`\n✅ Batch processing completed successfully`);

    return {
      success: true,
      salesIngested: ingestedCount,
      floorHeroesExcluded: floorCount,
    };
  } catch (error) {
    console.error('\n❌ Batch processing failed:', error);

    // Update processing log with error
    await db
      .update(processingLog)
      .set({
        status: 'failed',
        errorMessage: error.message,
      })
      .where(eq(processingLog.id, logEntry.id));

    throw error;
  }
}

/**
 * Detect and mark floor heroes for exclusion
 * @param {Date} asOfDate - Processing date
 * @returns {Promise<number>} Number of floor heroes marked
 */
async function detectFloorHeroes(asOfDate) {
  let markedCount = 0;

  // Get all sales for this as_of_date that haven't been checked
  const sales = await db
    .select({
      saleId: tavernSales.id,
      heroId: tavernSales.heroId,
      realm: tavernSales.realm,
      saleTimestamp: tavernSales.saleTimestamp,
      priceAmount: tavernSales.priceAmount,
      priceUsd: tavernSales.priceUsd,
      buyerAddress: tavernSales.buyerAddress,
      snapshot: heroSnapshots,
    })
    .from(tavernSales)
    .leftJoin(heroSnapshots, eq(tavernSales.id, heroSnapshots.saleId))
    .where(
      and(
        eq(tavernSales.asOfDate, asOfDate),
        eq(tavernSales.isFloorHero, false)
      )
    );

  // Calculate realm floor prices
  const floorPrices = await calculateRealmFloors(asOfDate);

  // Detect sweep patterns
  const sweepBuyers = await detectSweepPatterns(sales);

  for (const sale of sales) {
    const reasons = [];

    // Check 1: Price proximity to realm floor
    const floorPrice = floorPrices[sale.realm];
    if (floorPrice && sale.priceUsd) {
      const priceDiff = (parseFloat(sale.priceUsd) - floorPrice) / floorPrice;
      if (priceDiff < 0.05) { // Within 5% of floor
        reasons.push(`price_within_5pct_of_floor (${(priceDiff * 100).toFixed(1)}%)`);
      }
    }

    // Check 2: Low-quality trait bundle
    if (sale.snapshot) {
      const isLowQuality = (
        sale.snapshot.rarity === 0 && // Common
        sale.snapshot.advancedGenes === 0 &&
        sale.snapshot.eliteGenes === 0 &&
        sale.snapshot.exaltedGenes === 0 &&
        sale.snapshot.level < 5
      );

      if (isLowQuality) {
        reasons.push('low_quality_traits (common, no genes, low level)');
      }

      // Check profession mismatch
      const professionMismatch = isProfessionMismatched(
        sale.snapshot.mainClass,
        sale.snapshot.profession
      );
      if (professionMismatch && sale.snapshot.level < 10) {
        reasons.push('profession_mismatched');
      }
    }

    // Check 3: Very low USD value
    if (sale.priceUsd && parseFloat(sale.priceUsd) < 5) {
      reasons.push(`very_low_usd_value ($${sale.priceUsd})`);
    }

    // Check 4: Sweep pattern
    if (sweepBuyers.has(sale.buyerAddress)) {
      reasons.push('sweep_pattern (bulk buyer)');
    }

    // Mark as floor if any criteria met
    if (reasons.length > 0) {
      await db
        .update(tavernSales)
        .set({
          isFloorHero: true,
          floorExclusionReason: reasons.join(', '),
        })
        .where(eq(tavernSales.id, sale.saleId));

      markedCount++;
    }
  }

  return markedCount;
}

/**
 * Calculate floor prices by realm for a given date
 * @param {Date} asOfDate - Processing date
 * @returns {Promise<Object>} Realm floor prices in USD
 */
async function calculateRealmFloors(asOfDate) {
  const realmFloors = {};

  const realms = ['cv', 'sd', 'metis'];

  for (const realm of realms) {
    // Get lowest 10 sales for the realm on this date
    const lowPriceSales = await db
      .select({ priceUsd: tavernSales.priceUsd })
      .from(tavernSales)
      .where(
        and(
          eq(tavernSales.realm, realm),
          eq(tavernSales.asOfDate, asOfDate),
          sql`${tavernSales.priceUsd} IS NOT NULL`
        )
      )
      .orderBy(tavernSales.priceUsd)
      .limit(10);

    if (lowPriceSales.length > 0) {
      // Floor is median of lowest 10
      const prices = lowPriceSales.map(s => parseFloat(s.priceUsd));
      realmFloors[realm] = median(prices);
    }
  }

  return realmFloors;
}

/**
 * Detect sweep patterns (same buyer, many heroes, short time window)
 * @param {Array} sales - Array of sale objects
 * @returns {Set<string>} Set of buyer addresses that are sweepers
 */
function detectSweepPatterns(sales) {
  const sweepers = new Set();
  const buyerActivity = {};

  // Group sales by buyer
  for (const sale of sales) {
    if (!sale.buyerAddress) continue;

    if (!buyerActivity[sale.buyerAddress]) {
      buyerActivity[sale.buyerAddress] = [];
    }

    buyerActivity[sale.buyerAddress].push({
      timestamp: new Date(sale.saleTimestamp),
      heroId: sale.heroId,
    });
  }

  // Detect sweepers: 5+ purchases within 1 hour
  for (const [buyer, purchases] of Object.entries(buyerActivity)) {
    if (purchases.length < 5) continue;

    // Sort by timestamp
    purchases.sort((a, b) => a.timestamp - b.timestamp);

    // Check if first and last purchase are within 1 hour
    const timeSpan = purchases[purchases.length - 1].timestamp - purchases[0].timestamp;
    const oneHour = 60 * 60 * 1000;

    if (timeSpan < oneHour) {
      sweepers.add(buyer);
    }
  }

  return sweepers;
}

/**
 * Check if profession is mismatched with main class
 * @param {string} mainClass - Hero's main class
 * @param {string} profession - Hero's profession
 * @returns {boolean} True if mismatched
 */
function isProfessionMismatched(mainClass, profession) {
  if (!profession || profession === 'None') return false;

  // Ideal profession-class pairings
  const idealPairings = {
    'Warrior': 'mining',
    'Knight': 'mining',
    'Paladin': 'mining',
    'Wizard': 'foraging',
    'Sage': 'foraging',
    'Summoner': 'foraging',
    'Archer': 'foraging',
    'Thief': 'fishing',
    'Ninja': 'fishing',
    'Pirate': 'fishing',
    'Priest': 'gardening',
    'Monk': 'gardening',
    'DarkKnight': 'gardening',
  };

  const ideal = idealPairings[mainClass];
  return ideal && profession.toLowerCase() !== ideal;
}

/**
 * Calculate median of array of numbers
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Median value
 */
function median(values) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

// Export database client for use in other modules
export { db };
