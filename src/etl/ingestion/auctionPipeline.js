/**
 * Auction Pipeline - Production-grade ingestion for DFK tavern sales
 * 
 * Replaces the delta-based sale detection with canonical auction tracking:
 * - Job 1: Listing Indexer - Snapshots open auctions into tavern_listings
 * - Job 2: Auction Finalizer - Classifies closed auctions as SOLD or DELISTED
 * - Job 3: Backfill - Catches fast sales missed between snapshots
 * 
 * Uses DB-backed state (no in-memory diffs) and advisory locks for safety.
 */

import { rawPg } from '../../../server/db.js';

const DFK_GRAPHQL_URL = 'https://api.defikingdoms.com/graphql';
const GRACE_PERIOD_MINUTES = 15;
const BACKFILL_DAYS = 90;

const CLASS_NAMES = {
  0: 'Warrior', 1: 'Knight', 2: 'Thief', 3: 'Archer', 4: 'Priest', 5: 'Wizard',
  6: 'Monk', 7: 'Pirate', 8: 'Berserker', 9: 'Seer', 10: 'Legionnaire', 11: 'Scholar',
  16: 'Paladin', 17: 'DarkKnight', 18: 'Summoner', 19: 'Ninja', 20: 'Shapeshifter',
  21: 'Bard', 24: 'Dragoon', 25: 'Sage', 26: 'SpellBow', 28: 'DreadKnight'
};

const PROFESSION_NAMES = {
  0: 'mining', 2: 'gardening', 4: 'fishing', 6: 'foraging'
};

const CV_ID_MIN = BigInt("1000000000000");
const CV_ID_MAX = BigInt("2000000000000");

function weiToNative(weiStr) {
  if (!weiStr) return null;
  try {
    const wei = BigInt(weiStr);
    return Number(wei) / 1e18;
  } catch { return null; }
}

function resolveClassName(val) {
  if (val == null) return null;
  if (typeof val === 'string' && isNaN(val)) return val;
  return CLASS_NAMES[parseInt(val)] || `Class${val}`;
}

function resolveProfession(val) {
  if (val == null) return null;
  if (typeof val === 'string' && isNaN(val)) return val;
  return PROFESSION_NAMES[parseInt(val)] || `profession${val}`;
}

function detectRealm(heroId, network) {
  const net = (network || '').toLowerCase();
  if (net === 'met' || net === 'metis') return 'sd';
  if (net === 'dfk' || net === 'avalanche' || net === 'avax') return 'cv';
  try {
    const big = BigInt(heroId);
    if (big >= CV_ID_MIN && big < CV_ID_MAX) return 'cv';
    if (big >= CV_ID_MAX) return 'sd';
  } catch {}
  return 'cv';
}

function normalizeIdFromPadded(paddedId) {
  try {
    return Number(BigInt(paddedId) % BigInt(1000000000000));
  } catch { return 0; }
}

function getAbilityTierPoints(id) {
  if (id == null) return 0;
  const n = typeof id === 'string' ? parseInt(id) : id;
  if (isNaN(n)) return 0;
  if (n >= 0 && n <= 14) {
    if (n <= 7) return 0;
    if (n <= 11) return 1;
    if (n <= 13) return 2;
    return 3;
  }
  if (n >= 16 && n <= 30) {
    if (n <= 23) return 0;
    if (n <= 27) return 1;
    if (n <= 29) return 2;
    return 3;
  }
  return 0;
}

function calcTraitScore(hero) {
  return getAbilityTierPoints(hero.active1) +
    getAbilityTierPoints(hero.active2) +
    getAbilityTierPoints(hero.passive1) +
    getAbilityTierPoints(hero.passive2);
}

async function graphqlRequest(query, variables = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(DFK_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000);
        console.log(`[AuctionPipeline] GraphQL ${res.status}, retry ${attempt + 1}/${retries} in ${Math.round(backoff)}ms`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'GraphQL error');
      return json.data;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

const OPEN_AUCTIONS_QUERY = `
  query OpenAuctions($first: Int!, $skip: Int!) {
    saleAuctions(
      first: $first
      skip: $skip
      where: { endedAt: null, winner: null }
      orderBy: startedAt
      orderDirection: desc
    ) {
      id
      startedAt
      startingPrice
      endingPrice
      seller { id }
      tokenId {
        id
        normalizedId
        network
        originRealm
        mainClass
        subClass
        profession
        rarity
        shiny
        generation
        level
        summons
        maxSummons
        statBoost1
        statBoost2
        statGenes
        visualGenes
        active1
        active2
        passive1
        passive2
        salePrice
      }
    }
  }
`;

const FINALIZE_AUCTION_QUERY = `
  query FinalizeAuction($auctionId: ID!) {
    saleAuction(id: $auctionId) {
      id
      endedAt
      purchasePrice
      startingPrice
      seller { id }
      winner { id }
      tokenId {
        id
        normalizedId
      }
    }
  }
`;

const BACKFILL_SOLD_QUERY = `
  query BackfillSold($first: Int!, $skip: Int!, $since: Int!) {
    saleAuctions(
      first: $first
      skip: $skip
      where: { purchasePrice_not: null, endedAt_gte: $since }
      orderBy: endedAt
      orderDirection: desc
    ) {
      id
      endedAt
      purchasePrice
      startingPrice
      seller { id }
      winner { id }
      tokenId {
        id
        normalizedId
        network
        originRealm
        mainClass
        subClass
        profession
        rarity
        generation
        level
        summons
        maxSummons
        statBoost1
        statBoost2
        statGenes
        visualGenes
        active1
        active2
        passive1
        passive2
      }
    }
  }
`;

function auctionToListing(auction) {
  const hero = auction.tokenId || {};
  const heroId = hero.id || '';
  const normalizedId = hero.normalizedId ? Number(hero.normalizedId) : normalizeIdFromPadded(heroId);
  const realm = detectRealm(heroId, hero.network);
  const nativeToken = realm === 'cv' ? 'CRYSTAL' : 'JADE';
  const priceNative = weiToNative(auction.startingPrice);
  const traitScore = calcTraitScore(hero);

  return {
    auctionId: auction.id,
    realm,
    heroId,
    heroIdNormalized: normalizedId,
    network: hero.network || null,
    originRealm: hero.originRealm || null,
    mainClass: resolveClassName(hero.mainClass) || 'Unknown',
    subClass: resolveClassName(hero.subClass),
    profession: resolveProfession(hero.profession),
    rarity: hero.rarity ?? 0,
    level: hero.level ?? 1,
    generation: hero.generation ?? 0,
    summons: hero.summons ?? 0,
    maxSummons: hero.maxSummons ?? 0,
    shiny: hero.shiny === true,
    statGenes: hero.statGenes || null,
    visualGenes: hero.visualGenes || null,
    statBoost1: hero.statBoost1 != null ? String(hero.statBoost1) : null,
    statBoost2: hero.statBoost2 != null ? String(hero.statBoost2) : null,
    traitScore,
    sellerAddress: auction.seller?.id || null,
    startingPrice: auction.startingPrice || null,
    priceNative,
    nativeToken,
    startedAt: auction.startedAt ? new Date(Number(auction.startedAt) * 1000) : null,
  };
}

async function acquireAdvisoryLock(lockKey) {
  const result = await rawPg`SELECT pg_try_advisory_lock(hashtext(${lockKey})) as acquired`;
  return result[0]?.acquired === true;
}

async function releaseAdvisoryLock(lockKey) {
  await rawPg`SELECT pg_advisory_unlock(hashtext(${lockKey}))`;
}

// ============================================================================
// JOB 1: LISTING INDEXER
// ============================================================================

export async function runListingIndexer(realm = 'cv', options = {}) {
  const { dryRun = false } = options;
  const lockKey = `dfk:indexer:${realm}`;
  const log = (msg) => console.log(`[ListingIndexer:${realm}] ${msg}`);

  const acquired = await acquireAdvisoryLock(lockKey);
  if (!acquired) {
    log('Another instance running, skipping');
    return { ok: false, reason: 'lock_held' };
  }

  const stats = { fetched: 0, upserted: 0, deactivated: 0, errors: 0 };

  try {
    log('Starting listing indexer run...');
    const runTimestamp = new Date();

    const allAuctions = [];
    let skip = 0;
    const pageSize = 1000;

    while (true) {
      const data = await graphqlRequest(OPEN_AUCTIONS_QUERY, { first: pageSize, skip });
      const auctions = data?.saleAuctions || [];
      if (auctions.length === 0) break;

      for (const auction of auctions) {
        const listing = auctionToListing(auction);
        if (listing.realm === realm) {
          allAuctions.push(listing);
        }
      }

      skip += auctions.length;
      if (auctions.length < pageSize) break;
      if (skip > 50000) { log('Safety limit reached'); break; }
    }

    stats.fetched = allAuctions.length;
    log(`Fetched ${allAuctions.length} open auctions for realm ${realm}`);

    if (dryRun) {
      log(`DRY RUN - would upsert ${allAuctions.length} listings`);
      return { ok: true, dryRun: true, stats };
    }

    const seenAuctionIds = new Set();

    for (const listing of allAuctions) {
      seenAuctionIds.add(listing.auctionId);
      try {
        await rawPg`
          INSERT INTO tavern_listings (
            auction_id, realm, hero_id, hero_id_normalized, network, origin_realm,
            main_class, sub_class, profession, rarity, level, generation,
            summons, max_summons, shiny, stat_genes, visual_genes,
            stat_boost_1, stat_boost_2, trait_score,
            seller_address, starting_price, price_native, native_token,
            started_at, is_active, last_seen_at, last_indexed_at
          ) VALUES (
            ${listing.auctionId}, ${listing.realm}, ${listing.heroId}, ${listing.heroIdNormalized},
            ${listing.network}, ${listing.originRealm},
            ${listing.mainClass}, ${listing.subClass}, ${listing.profession},
            ${listing.rarity}, ${listing.level}, ${listing.generation},
            ${listing.summons}, ${listing.maxSummons}, ${listing.shiny},
            ${listing.statGenes}, ${listing.visualGenes},
            ${listing.statBoost1}, ${listing.statBoost2}, ${listing.traitScore},
            ${listing.sellerAddress}, ${listing.startingPrice},
            ${listing.priceNative}, ${listing.nativeToken},
            ${listing.startedAt}, true, ${runTimestamp}, ${runTimestamp}
          )
          ON CONFLICT (realm, auction_id) DO UPDATE SET
            is_active = true,
            inactive_since = NULL,
            last_seen_at = ${runTimestamp},
            last_indexed_at = ${runTimestamp},
            price_native = EXCLUDED.price_native,
            starting_price = EXCLUDED.starting_price,
            level = EXCLUDED.level,
            summons = EXCLUDED.summons,
            max_summons = EXCLUDED.max_summons,
            trait_score = EXCLUDED.trait_score
        `;
        stats.upserted++;
      } catch (err) {
        stats.errors++;
        if (stats.errors <= 3) log(`Upsert error for auction ${listing.auctionId}: ${err.message}`);
      }
    }

    const deactivated = await rawPg`
      UPDATE tavern_listings
      SET is_active = false,
          inactive_since = COALESCE(inactive_since, ${runTimestamp})
      WHERE realm = ${realm}
        AND is_active = true
        AND last_seen_at < ${runTimestamp}
      RETURNING auction_id
    `;
    stats.deactivated = deactivated.length;

    await rawPg`
      INSERT INTO tavern_ingestion_jobs (job_name, realm, last_run_at, metadata)
      VALUES ('listing_indexer', ${realm}, ${runTimestamp}, ${JSON.stringify(stats)})
      ON CONFLICT (job_name, realm) DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        metadata = EXCLUDED.metadata
    `;

    log(`Done: ${stats.upserted} upserted, ${stats.deactivated} deactivated, ${stats.errors} errors`);
    return { ok: true, stats };

  } catch (err) {
    log(`Error: ${err.message}`);
    return { ok: false, error: err.message, stats };
  } finally {
    await releaseAdvisoryLock(lockKey);
  }
}

// ============================================================================
// JOB 2: AUCTION FINALIZER
// ============================================================================

export async function runAuctionFinalizer(realm = 'cv', options = {}) {
  const { dryRun = false, gracePeriodMinutes = GRACE_PERIOD_MINUTES, batchSize = 50 } = options;
  const lockKey = `dfk:finalizer:${realm}`;
  const log = (msg) => console.log(`[AuctionFinalizer:${realm}] ${msg}`);

  const acquired = await acquireAdvisoryLock(lockKey);
  if (!acquired) {
    log('Another instance running, skipping');
    return { ok: false, reason: 'lock_held' };
  }

  const stats = { processed: 0, sold: 0, delisted: 0, errors: 0 };

  try {
    const graceThreshold = new Date(Date.now() - gracePeriodMinutes * 60 * 1000);

    const closedListings = await rawPg`
      SELECT id, auction_id, realm, hero_id, hero_id_normalized,
             main_class, sub_class, profession, rarity, level, generation,
             summons, max_summons, trait_score, stat_boost_1, stat_boost_2,
             price_native, native_token, seller_address, starting_price
      FROM tavern_listings
      WHERE realm = ${realm}
        AND is_active = false
        AND inactive_since IS NOT NULL
        AND inactive_since <= ${graceThreshold}
        AND closed_processed_at IS NULL
      ORDER BY inactive_since ASC
      LIMIT ${batchSize}
    `;

    if (closedListings.length === 0) {
      log('No closed auctions to process');
      return { ok: true, stats };
    }

    log(`Processing ${closedListings.length} closed auctions...`);

    if (dryRun) {
      log(`DRY RUN - would process ${closedListings.length} auctions`);
      return { ok: true, dryRun: true, count: closedListings.length, stats };
    }

    for (const listing of closedListings) {
      try {
        const data = await graphqlRequest(FINALIZE_AUCTION_QUERY, { auctionId: listing.auction_id });
        const auction = data?.saleAuction;

        let status = 'DELISTED';
        let purchasePriceWei = null;
        let purchasePriceNative = null;
        let endedAt = new Date();
        let buyerAddress = null;
        let salePrice = listing.price_native ? parseFloat(listing.price_native) : 0;

        if (auction) {
          if (auction.purchasePrice != null && auction.purchasePrice !== '0') {
            status = 'SOLD';
            purchasePriceWei = auction.purchasePrice;
            purchasePriceNative = weiToNative(auction.purchasePrice);
            salePrice = purchasePriceNative || salePrice;
          }
          if (auction.endedAt) {
            endedAt = new Date(Number(auction.endedAt) * 1000);
          }
          buyerAddress = auction.winner?.id || null;
        }

        const heroIdNum = listing.hero_id_normalized || 0;
        const tokenAddress = listing.native_token === 'CRYSTAL'
          ? '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb'
          : '0xB3F5867E277798b50ba7A71C0b24FDcA03045eDF';

        await rawPg`
          INSERT INTO tavern_sales (
            hero_id, realm, sale_timestamp, token_address, token_symbol,
            price_amount, as_of_date, auction_id, status, ended_at,
            purchase_price_wei, purchase_price_native, source,
            buyer_address, seller_address,
            main_class, sub_class, profession, rarity, level,
            generation, summons, max_summons, trait_score
          ) VALUES (
            ${heroIdNum}, ${listing.realm}, ${endedAt},
            ${tokenAddress}, ${listing.native_token || 'CRYSTAL'},
            ${salePrice}, ${endedAt}, ${listing.auction_id},
            ${status}, ${endedAt}, ${purchasePriceWei}, ${purchasePriceNative},
            'FINALIZED_AUCTION',
            ${buyerAddress}, ${listing.seller_address},
            ${listing.main_class}, ${listing.sub_class}, ${listing.profession},
            ${listing.rarity}, ${listing.level}, ${listing.generation},
            ${listing.summons}, ${listing.max_summons}, ${listing.trait_score}
          )
          ON CONFLICT (realm, auction_id) WHERE auction_id IS NOT NULL DO UPDATE SET
            status = EXCLUDED.status,
            ended_at = EXCLUDED.ended_at,
            purchase_price_wei = EXCLUDED.purchase_price_wei,
            purchase_price_native = EXCLUDED.purchase_price_native,
            price_amount = EXCLUDED.price_amount,
            buyer_address = EXCLUDED.buyer_address,
            source = EXCLUDED.source
        `;

        await rawPg`
          UPDATE tavern_listings
          SET closed_processed_at = NOW()
          WHERE id = ${listing.id}
        `;

        stats.processed++;
        if (status === 'SOLD') stats.sold++;
        else stats.delisted++;

      } catch (err) {
        stats.errors++;
        if (stats.errors <= 5) log(`Error finalizing auction ${listing.auction_id}: ${err.message}`);
      }

      if (stats.processed % 10 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    await rawPg`
      INSERT INTO tavern_ingestion_jobs (job_name, realm, last_run_at, metadata)
      VALUES ('auction_finalizer', ${realm}, NOW(), ${JSON.stringify(stats)})
      ON CONFLICT (job_name, realm) DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        metadata = EXCLUDED.metadata
    `;

    log(`Done: ${stats.processed} processed (${stats.sold} sold, ${stats.delisted} delisted, ${stats.errors} errors)`);
    return { ok: true, stats };

  } catch (err) {
    log(`Error: ${err.message}`);
    return { ok: false, error: err.message, stats };
  } finally {
    await releaseAdvisoryLock(lockKey);
  }
}

// ============================================================================
// JOB 3: BACKFILL SOLD AUCTIONS
// ============================================================================

export async function runSalesBackfill(realm = 'cv', options = {}) {
  const { dryRun = false, days = BACKFILL_DAYS } = options;
  const lockKey = `dfk:backfill:${realm}`;
  const log = (msg) => console.log(`[SalesBackfill:${realm}] ${msg}`);

  const acquired = await acquireAdvisoryLock(lockKey);
  if (!acquired) {
    log('Another instance running, skipping');
    return { ok: false, reason: 'lock_held' };
  }

  const stats = { fetched: 0, inserted: 0, skipped: 0, errors: 0 };

  try {
    const sinceEpoch = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
    log(`Backfilling sold auctions since ${new Date(sinceEpoch * 1000).toISOString()}...`);

    const existingAuctions = await rawPg`
      SELECT auction_id FROM tavern_sales
      WHERE realm = ${realm} AND auction_id IS NOT NULL
    `;
    const existingSet = new Set(existingAuctions.map(r => r.auction_id));

    let skip = 0;
    const pageSize = 1000;

    while (true) {
      const data = await graphqlRequest(BACKFILL_SOLD_QUERY, { first: pageSize, skip, since: sinceEpoch });
      const auctions = data?.saleAuctions || [];
      if (auctions.length === 0) break;

      for (const auction of auctions) {
        stats.fetched++;
        if (existingSet.has(auction.id)) {
          stats.skipped++;
          continue;
        }

        const hero = auction.tokenId || {};
        const heroId = hero.id || '';
        const detectedRealm = detectRealm(heroId, hero.network);
        if (detectedRealm !== realm) {
          stats.skipped++;
          continue;
        }

        if (dryRun) {
          stats.inserted++;
          continue;
        }

        try {
          const normalizedId = hero.normalizedId ? Number(hero.normalizedId) : normalizeIdFromPadded(heroId);
          const purchasePriceNative = weiToNative(auction.purchasePrice);
          const endedAt = auction.endedAt ? new Date(Number(auction.endedAt) * 1000) : new Date();
          const nativeToken = realm === 'cv' ? 'CRYSTAL' : 'JADE';
          const tokenAddress = nativeToken === 'CRYSTAL'
            ? '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb'
            : '0xB3F5867E277798b50ba7A71C0b24FDcA03045eDF';
          const traitScore = calcTraitScore(hero);

          await rawPg`
            INSERT INTO tavern_sales (
              hero_id, realm, sale_timestamp, token_address, token_symbol,
              price_amount, as_of_date, auction_id, status, ended_at,
              purchase_price_wei, purchase_price_native, source,
              buyer_address, seller_address,
              main_class, sub_class, profession, rarity, level,
              generation, summons, max_summons, trait_score
            ) VALUES (
              ${normalizedId}, ${realm}, ${endedAt},
              ${tokenAddress}, ${nativeToken},
              ${purchasePriceNative || 0}, ${endedAt}, ${auction.id},
              'SOLD', ${endedAt}, ${auction.purchasePrice}, ${purchasePriceNative},
              'BACKFILL',
              ${auction.winner?.id || null}, ${auction.seller?.id || null},
              ${resolveClassName(hero.mainClass)}, ${resolveClassName(hero.subClass)},
              ${resolveProfession(hero.profession)},
              ${hero.rarity ?? 0}, ${hero.level ?? 1}, ${hero.generation ?? 0},
              ${hero.summons ?? 0}, ${hero.maxSummons ?? 0}, ${traitScore}
            )
            ON CONFLICT (realm, auction_id) WHERE auction_id IS NOT NULL DO NOTHING
          `;
          stats.inserted++;
          existingSet.add(auction.id);
        } catch (err) {
          stats.errors++;
          if (stats.errors <= 5) log(`Error inserting backfill auction ${auction.id}: ${err.message}`);
        }
      }

      skip += auctions.length;
      if (auctions.length < pageSize) break;
      if (skip > 100000) { log('Safety limit reached'); break; }

      await new Promise(r => setTimeout(r, 300));
    }

    await rawPg`
      INSERT INTO tavern_ingestion_jobs (job_name, realm, last_run_at, metadata)
      VALUES ('sales_backfill', ${realm}, NOW(), ${JSON.stringify(stats)})
      ON CONFLICT (job_name, realm) DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        metadata = EXCLUDED.metadata
    `;

    log(`Done: ${stats.fetched} fetched, ${stats.inserted} inserted, ${stats.skipped} skipped, ${stats.errors} errors`);
    return { ok: true, dryRun, stats };

  } catch (err) {
    log(`Error: ${err.message}`);
    return { ok: false, error: err.message, stats };
  } finally {
    await releaseAdvisoryLock(lockKey);
  }
}

// ============================================================================
// JOB 4: BACKFILL CLOSED AUCTIONS (GEN0-FOCUSED, SOLD + DELISTED)
// ============================================================================

const CLOSED_AUCTIONS_QUERY = `
  query ClosedAuctions($first: Int!, $skip: Int!, $since: Int!) {
    saleAuctions(
      first: $first
      skip: $skip
      where: { startedAt_gte: $since }
      orderBy: startedAt
      orderDirection: desc
    ) {
      id
      startedAt
      endedAt
      startingPrice
      endingPrice
      purchasePrice
      seller { id }
      winner { id }
      tokenId {
        id
        normalizedId
        generation
        rarity
        mainClass
        subClass
        profession
        level
        summons
        maxSummons
        statBoost1
        statBoost2
        network
        originRealm
      }
    }
  }
`;

export async function backfillClosedAuctions({ realm = 'cv', daysLookback = 730, gen0Only = true } = {}) {
  const lockKey = `dfk:backfill-closed:${realm}`;
  const log = (msg) => console.log(`[ClosedAuctionBackfill:${realm}] ${msg}`);

  const acquired = await acquireAdvisoryLock(lockKey);
  if (!acquired) {
    log('Another instance running, skipping');
    return { ok: false, reason: 'lock_held' };
  }

  const stats = { fetched: 0, inserted: 0, updated: 0, skipped: 0, skippedNonGen0: 0, skippedNoEnd: 0, sold: 0, delisted: 0, errors: 0 };

  try {
    const sinceEpoch = Math.floor((Date.now() - daysLookback * 24 * 60 * 60 * 1000) / 1000);
    log(`Backfilling closed auctions since ${new Date(sinceEpoch * 1000).toISOString()} (${daysLookback} days)${gen0Only ? ' [Gen0 only]' : ''}...`);

    const existingAuctions = await rawPg`
      SELECT auction_id FROM tavern_sales
      WHERE realm = ${realm} AND auction_id IS NOT NULL
    `;
    const existingSet = new Set(existingAuctions.map(r => r.auction_id));
    log(`Found ${existingSet.size} existing auction IDs in DB`);

    let skip = 0;
    const pageSize = 1000;
    let pagesProcessed = 0;

    while (true) {
      const data = await graphqlRequest(CLOSED_AUCTIONS_QUERY, { first: pageSize, skip, since: sinceEpoch });
      const auctions = data?.saleAuctions || [];
      if (auctions.length === 0) break;

      pagesProcessed++;
      let pageInserted = 0;

      for (const auction of auctions) {
        stats.fetched++;

        if (!auction.endedAt) {
          stats.skippedNoEnd++;
          continue;
        }

        const hero = auction.tokenId || {};
        const heroGen = hero.generation != null ? parseInt(hero.generation) : null;

        if (gen0Only && heroGen !== 0) {
          stats.skippedNonGen0++;
          continue;
        }

        const heroId = hero.id || '';
        const detectedRealm = detectRealm(heroId, hero.network);
        if (detectedRealm !== realm) {
          stats.skipped++;
          continue;
        }

        const isAlreadyInDb = existingSet.has(auction.id);

        try {
          const normalizedId = hero.normalizedId ? Number(hero.normalizedId) : normalizeIdFromPadded(heroId);
          const endedAt = new Date(Number(auction.endedAt) * 1000);
          const nativeToken = realm === 'cv' ? 'CRYSTAL' : realm === 'sd' ? 'JADE' : 'JEWEL';
          const tokenAddress = nativeToken === 'CRYSTAL'
            ? '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb'
            : '0xB3F5867E277798b50ba7A71C0b24FDcA03045eDF';

          let status = 'DELISTED';
          let purchasePriceWei = null;
          let purchasePriceNative = null;
          let salePrice = 0;
          let buyerAddress = null;

          if (auction.purchasePrice != null && auction.purchasePrice !== '0') {
            status = 'SOLD';
            purchasePriceWei = auction.purchasePrice;
            purchasePriceNative = weiToNative(auction.purchasePrice);
            salePrice = purchasePriceNative || 0;
            stats.sold++;
          } else {
            stats.delisted++;
          }

          buyerAddress = auction.winner?.id || null;
          const traitScore = calcTraitScore(hero);

          await rawPg`
            INSERT INTO tavern_sales (
              hero_id, realm, sale_timestamp, token_address, token_symbol,
              price_amount, as_of_date, auction_id, status, ended_at,
              purchase_price_wei, purchase_price_native, source,
              buyer_address, seller_address,
              main_class, sub_class, profession, rarity, level,
              generation, summons, max_summons, trait_score
            ) VALUES (
              ${normalizedId}, ${realm}, ${endedAt},
              ${tokenAddress}, ${nativeToken},
              ${salePrice}, ${endedAt}, ${auction.id},
              ${status}, ${endedAt}, ${purchasePriceWei}, ${purchasePriceNative},
              'BACKFILL_CLOSED',
              ${buyerAddress}, ${auction.seller?.id || null},
              ${resolveClassName(hero.mainClass)}, ${resolveClassName(hero.subClass)},
              ${resolveProfession(hero.profession)},
              ${hero.rarity ?? 0}, ${hero.level ?? 1}, ${hero.generation ?? 0},
              ${hero.summons ?? 0}, ${hero.maxSummons ?? 0}, ${traitScore}
            )
            ON CONFLICT (realm, auction_id) WHERE auction_id IS NOT NULL DO UPDATE SET
              status = EXCLUDED.status,
              ended_at = EXCLUDED.ended_at,
              purchase_price_wei = EXCLUDED.purchase_price_wei,
              purchase_price_native = EXCLUDED.purchase_price_native,
              price_amount = EXCLUDED.price_amount,
              buyer_address = EXCLUDED.buyer_address,
              source = CASE WHEN tavern_sales.source = 'BACKFILL_CLOSED' THEN 'BACKFILL_CLOSED' ELSE EXCLUDED.source END
          `;

          if (isAlreadyInDb) {
            stats.updated++;
          } else {
            stats.inserted++;
            existingSet.add(auction.id);
          }
          pageInserted++;
        } catch (err) {
          stats.errors++;
          if (stats.errors <= 5) log(`Error inserting auction ${auction.id}: ${err.message}`);
        }
      }

      log(`Page ${pagesProcessed}: ${auctions.length} fetched, ${pageInserted} upserted (total: ${stats.inserted} new, ${stats.updated} updated, ${stats.sold} sold, ${stats.delisted} delisted)`);

      skip += auctions.length;
      if (auctions.length < pageSize) break;
      if (skip > 500000) { log('Safety limit reached at 500k records'); break; }

      await new Promise(r => setTimeout(r, 300));
    }

    await rawPg`
      INSERT INTO tavern_ingestion_jobs (job_name, realm, last_run_at, metadata)
      VALUES ('closed_auction_backfill', ${realm}, NOW(), ${JSON.stringify(stats)})
      ON CONFLICT (job_name, realm) DO UPDATE SET
        last_run_at = EXCLUDED.last_run_at,
        metadata = EXCLUDED.metadata
    `;

    log(`Done: ${stats.fetched} fetched, ${stats.inserted} new, ${stats.updated} updated (${stats.sold} sold, ${stats.delisted} delisted), ${stats.skippedNonGen0} non-Gen0 skipped, ${stats.skippedNoEnd} no endedAt, ${stats.errors} errors`);
    return { ok: true, stats };

  } catch (err) {
    log(`Error: ${err.message}`);
    return { ok: false, error: err.message, stats };
  } finally {
    await releaseAdvisoryLock(lockKey);
  }
}

// ============================================================================
// SYNC TO TAVERN_HEROES (UI COMPATIBILITY)
// ============================================================================

export async function syncListingsToTavernHeroes(realm = 'cv') {
  const log = (msg) => console.log(`[ListingSync:${realm}] ${msg}`);
  try {
    const activeListings = await rawPg`
      SELECT hero_id, hero_id_normalized, realm, main_class, sub_class, profession,
             rarity, level, generation, summons, max_summons,
             stat_boost_1, stat_boost_2, trait_score,
             starting_price AS sale_price, price_native, native_token, stat_genes, visual_genes
      FROM tavern_listings
      WHERE realm = ${realm} AND is_active = true
    `;

    if (activeListings.length === 0) {
      log('No active listings to sync');
      return { ok: true, synced: 0 };
    }

    const batchId = `sync_${Date.now()}`;
    let synced = 0;

    for (const l of activeListings) {
      try {
        await rawPg`
          INSERT INTO tavern_heroes (
            hero_id, normalized_id, realm, main_class, sub_class, profession,
            rarity, level, generation, summons, max_summons,
            trait_score, sale_price, price_native, native_token, batch_id
          ) VALUES (
            ${l.hero_id}, ${l.hero_id_normalized}, ${l.realm},
            ${l.main_class}, ${l.sub_class}, ${l.profession},
            ${l.rarity}, ${l.level}, ${l.generation},
            ${l.summons}, ${l.max_summons}, ${l.trait_score},
            ${l.sale_price}, ${l.price_native}, ${l.native_token}, ${batchId}
          )
          ON CONFLICT (hero_id) DO UPDATE SET
            price_native = EXCLUDED.price_native,
            sale_price = EXCLUDED.sale_price,
            level = EXCLUDED.level,
            summons = EXCLUDED.summons,
            max_summons = EXCLUDED.max_summons,
            trait_score = EXCLUDED.trait_score,
            batch_id = EXCLUDED.batch_id,
            indexed_at = NOW()
        `;
        synced++;
      } catch (err) {
        if (synced === 0) log(`Sync error: ${err.message}`);
      }
    }

    log(`Synced ${synced} active listings to tavern_heroes`);
    return { ok: true, synced };
  } catch (err) {
    log(`Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ============================================================================
// ORCHESTRATOR - Run all jobs in sequence
// ============================================================================

export async function runFullPipeline(realm = 'cv', options = {}) {
  const log = (msg) => console.log(`[AuctionPipeline:${realm}] ${msg}`);
  const results = {};

  log('=== Starting full auction pipeline ===');

  results.indexer = await runListingIndexer(realm, options);
  log(`Indexer: ${results.indexer.ok ? 'OK' : 'FAILED'}`);

  results.finalizer = await runAuctionFinalizer(realm, options);
  log(`Finalizer: ${results.finalizer.ok ? 'OK' : 'FAILED'}`);

  if (!options.skipSync) {
    results.sync = await syncListingsToTavernHeroes(realm);
    log(`Sync: ${results.sync.ok ? 'OK' : 'FAILED'}`);
  }

  log('=== Pipeline complete ===');
  return { ok: true, results };
}

export async function getPipelineStatus() {
  try {
    const jobs = await rawPg`
      SELECT job_name, realm, last_run_at, metadata
      FROM tavern_ingestion_jobs
      ORDER BY last_run_at DESC
    `;

    const listingCounts = await rawPg`
      SELECT realm,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false AND closed_processed_at IS NULL) as pending_finalization,
        COUNT(*) FILTER (WHERE closed_processed_at IS NOT NULL) as finalized
      FROM tavern_listings
      GROUP BY realm
    `;

    const saleCounts = await rawPg`
      SELECT realm, status, COUNT(*) as count
      FROM tavern_sales
      GROUP BY realm, status
      ORDER BY realm, status
    `;

    return { ok: true, jobs, listings: listingCounts, sales: saleCounts };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
