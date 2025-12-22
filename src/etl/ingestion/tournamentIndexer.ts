// src/etl/ingestion/tournamentIndexer.ts
// Indexes PVP battle data and hero snapshots for the "Battle-Ready Heroes" recommendation system
// Uses DFK GraphQL API to fetch battle results and hero data
// Features: 5 smart workers, work-stealing, autostart in production, ETA progress tracking

import { GraphQLClient, gql } from 'graphql-request';
import { db } from '../../../server/db.js';
import { 
  pvpTournaments, 
  tournamentPlacements, 
  heroTournamentSnapshots,
  tournamentIndexerProgress,
} from '../../../shared/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

// GraphQL endpoints for each realm
const REALM_ENDPOINTS = {
  cv: 'https://api.defikingdoms.com/graphql', // Crystalvale (DFK Chain)
  sd: 'https://api.defikingdoms.com/graphql', // Serendale (Klaytn/Kaia) - same API, different realm filter
};

// Realm display names for user-facing messages
export const REALM_DISPLAY_NAMES: Record<string, string> = {
  cv: 'Crystalvale Tavern',
  sd: 'Sundered Isles Barkeep',
};

const client = new GraphQLClient(REALM_ENDPOINTS.cv);

const BATCH_SIZE = 50;
const SUPPORTED_REALMS = ['cv', 'sd'] as const;
type RealmType = typeof SUPPORTED_REALMS[number];
const NUM_WORKERS = 5;
const AUTO_RUN_INTERVAL_MS = 60000; // 1 minute between auto-runs
const WORKER_DELAY_MS = 100; // Delay between worker batches

// ============================================================
// INDEXER STATE MANAGEMENT
// ============================================================

interface WorkerState {
  id: number;
  status: 'idle' | 'working' | 'stealing' | 'done';
  battlesProcessed: number;
  lastBattleId: number | null;
  currentBatchStart: number;
  currentBatchEnd: number;
  errors: number;
}

interface IndexerState {
  isRunning: boolean;
  startedAt: Date | null;
  totalBattlesToProcess: number;
  battlesProcessed: number;
  placementsIndexed: number;
  snapshotsIndexed: number;
  workers: WorkerState[];
  throughputPerMinute: number;
  estimatedSecondsRemaining: number | null;
  lastThroughputUpdate: Date | null;
  recentProcessCounts: { timestamp: number; count: number }[];
}

const indexerState: IndexerState = {
  isRunning: false,
  startedAt: null,
  totalBattlesToProcess: 0,
  battlesProcessed: 0,
  placementsIndexed: 0,
  snapshotsIndexed: 0,
  workers: [],
  throughputPerMinute: 0,
  estimatedSecondsRemaining: null,
  lastThroughputUpdate: null,
  recentProcessCounts: [],
};

let autoRunInterval: NodeJS.Timeout | null = null;

// Initialize worker states
function initializeWorkers(count: number = NUM_WORKERS): void {
  indexerState.workers = Array.from({ length: count }, (_, i) => ({
    id: i,
    status: 'idle',
    battlesProcessed: 0,
    lastBattleId: null,
    currentBatchStart: 0,
    currentBatchEnd: 0,
    errors: 0,
  }));
}

// Update throughput calculation (rolling 5-minute window)
function updateThroughput(): void {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  
  // Add current count
  indexerState.recentProcessCounts.push({ 
    timestamp: now, 
    count: indexerState.battlesProcessed 
  });
  
  // Remove old entries
  indexerState.recentProcessCounts = indexerState.recentProcessCounts.filter(
    entry => entry.timestamp > fiveMinutesAgo
  );
  
  if (indexerState.recentProcessCounts.length >= 2) {
    const oldest = indexerState.recentProcessCounts[0];
    const newest = indexerState.recentProcessCounts[indexerState.recentProcessCounts.length - 1];
    const countDiff = newest.count - oldest.count;
    const timeDiffMinutes = (newest.timestamp - oldest.timestamp) / 60000;
    
    if (timeDiffMinutes > 0) {
      indexerState.throughputPerMinute = Math.round(countDiff / timeDiffMinutes);
      
      // Calculate ETA
      const remaining = indexerState.totalBattlesToProcess - indexerState.battlesProcessed;
      if (indexerState.throughputPerMinute > 0 && remaining > 0) {
        indexerState.estimatedSecondsRemaining = Math.round(
          (remaining / indexerState.throughputPerMinute) * 60
        );
      } else {
        indexerState.estimatedSecondsRemaining = null;
      }
    }
  }
  
  indexerState.lastThroughputUpdate = new Date();
}

// Ensure tournament tables exist (auto-initialization)
let tablesInitialized = false;
async function ensureTablesExist() {
  if (tablesInitialized) return;
  
  try {
    // Test if table exists by trying a simple query
    await db.execute(sql`SELECT 1 FROM tournament_indexer_progress LIMIT 1`);
    tablesInitialized = true;
  } catch (error) {
    // Table doesn't exist, create them
    console.log('[TournamentIndexer] Creating tournament tables...');
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tournament_indexer_progress (
        id SERIAL PRIMARY KEY,
        realm VARCHAR(50) NOT NULL DEFAULT 'cv',
        last_tournament_id INTEGER NOT NULL DEFAULT 0,
        tournaments_indexed INTEGER NOT NULL DEFAULT 0,
        placements_indexed INTEGER NOT NULL DEFAULT 0,
        snapshots_indexed INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'idle',
        last_error TEXT,
        last_run_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pvp_tournaments (
        id SERIAL PRIMARY KEY,
        tournament_id BIGINT NOT NULL UNIQUE,
        realm VARCHAR(50) NOT NULL DEFAULT 'cv',
        name VARCHAR(255),
        format VARCHAR(100),
        status VARCHAR(50),
        party_size INTEGER,
        level_min INTEGER,
        level_max INTEGER,
        rarity_min INTEGER,
        rarity_max INTEGER,
        stat_boost VARCHAR(100),
        background VARCHAR(100),
        tick_interval INTEGER,
        registration_ends_at TIMESTAMP,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        total_entrants INTEGER DEFAULT 0,
        host_player VARCHAR(100),
        opponent_player VARCHAR(100),
        winner_player VARCHAR(100),
        raw_battle_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tournament_placements (
        id SERIAL PRIMARY KEY,
        tournament_id BIGINT NOT NULL,
        hero_id BIGINT NOT NULL,
        player_address VARCHAR(100),
        placement VARCHAR(50) NOT NULL,
        team_index INTEGER,
        party_slot INTEGER,
        indexed_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hero_tournament_snapshots (
        id SERIAL PRIMARY KEY,
        placement_id INTEGER NOT NULL,
        hero_id BIGINT NOT NULL,
        tournament_id BIGINT NOT NULL,
        realm VARCHAR(50) NOT NULL DEFAULT 'cv',
        main_class VARCHAR(50),
        sub_class VARCHAR(50),
        rarity INTEGER,
        generation INTEGER,
        level INTEGER,
        xp INTEGER,
        strength INTEGER,
        agility INTEGER,
        dexterity INTEGER,
        vitality INTEGER,
        endurance INTEGER,
        intelligence INTEGER,
        wisdom INTEGER,
        luck INTEGER,
        hp INTEGER,
        mp INTEGER,
        stamina INTEGER,
        active1 VARCHAR(100),
        active2 VARCHAR(100),
        passive1 VARCHAR(100),
        passive2 VARCHAR(100),
        summons_remaining INTEGER,
        max_summons INTEGER,
        combat_power_score NUMERIC(20, 2),
        raw_hero_data JSONB,
        snapshot_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pvp_similarity_config (
        id SERIAL PRIMARY KEY,
        config_name VARCHAR(100) NOT NULL DEFAULT 'default',
        stats_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.40,
        active_abilities_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.25,
        passive_abilities_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.15,
        class_match_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.10,
        rarity_match_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
        gene_quality_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
        stat_weights JSONB DEFAULT '{"strength":0.15,"agility":0.15,"dexterity":0.10,"vitality":0.15,"endurance":0.10,"intelligence":0.15,"wisdom":0.10,"luck":0.10}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log('[TournamentIndexer] Tournament tables created');
    tablesInitialized = true;
  }
}

// Get indexer progress for a realm
async function getProgress(realm: RealmType = 'cv') {
  await ensureTablesExist();
  
  const result = await db
    .select()
    .from(tournamentIndexerProgress)
    .where(eq(tournamentIndexerProgress.realm, realm))
    .limit(1);
  
  if (result.length === 0) {
    await db.insert(tournamentIndexerProgress).values({ realm });
    return { lastTournamentId: 0, tournamentsIndexed: 0, placementsIndexed: 0, snapshotsIndexed: 0, realm };
  }
  return result[0];
}

// Update indexer progress for a realm
async function updateProgress(realm: RealmType, updates: Partial<typeof tournamentIndexerProgress.$inferInsert>) {
  await db
    .update(tournamentIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(tournamentIndexerProgress.realm, realm));
}

// GraphQL query for battles with hero data
const BATTLES_QUERY = gql`
  query GetBattles($first: Int!, $skip: Int!, $where: BattleFilter) {
    battles(first: $first, skip: $skip, orderBy: id, orderDirection: desc, where: $where) {
      id
      host {
        id
        name
      }
      opponent {
        id
        name
      }
      winner {
        id
        name
      }
      battleStartTime
      minLevel
      maxLevel
      minRarity
      maxRarity
      hostHeroes {
        id
        normalizedId
        rarity
        generation
        level
        mainClassStr
        subClassStr
        strength
        agility
        vitality
        endurance
        intelligence
        wisdom
        luck
        dexterity
        hp
        mp
        stamina
        active1
        active2
        passive1
        passive2
        statGenes
        summonsRemaining
        maxSummons
      }
      opponentHeroes {
        id
        normalizedId
        rarity
        generation
        level
        mainClassStr
        subClassStr
        strength
        agility
        vitality
        endurance
        intelligence
        wisdom
        luck
        dexterity
        hp
        mp
        stamina
        active1
        active2
        passive1
        passive2
        statGenes
        summonsRemaining
        maxSummons
      }
    }
  }
`;

interface BattleHero {
  id: string;
  normalizedId?: string;
  rarity: number;
  generation?: number;
  level: number;
  mainClassStr: string;
  subClassStr: string;
  strength: number;
  agility: number;
  vitality: number;
  endurance: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  dexterity: number;
  hp?: number;
  mp?: number;
  stamina?: number;
  active1?: number;
  active2?: number;
  passive1?: number;
  passive2?: number;
  statGenes?: string;
  summonsRemaining?: number;
  maxSummons?: number;
}

interface Battle {
  id: string;
  host: { id: string; name: string };
  opponent: { id: string; name: string };
  winner: { id: string; name: string } | null;
  battleStartTime: number;
  minLevel: number;
  maxLevel: number;
  minRarity: number;
  maxRarity: number;
  hostHeroes: BattleHero[];
  opponentHeroes: BattleHero[];
}

// Determine party size from hero count
function getPartySize(heroCount: number): number {
  if (heroCount <= 1) return 1;
  if (heroCount <= 3) return 3;
  return 6;
}

// Determine format string
function getFormat(partySize: number): string {
  if (partySize === 1) return '1v1';
  if (partySize === 3) return '3v3';
  return '6v6';
}

// Compute combat power score from stats
function computeCombatPowerScore(hero: BattleHero): number {
  return (
    hero.strength +
    hero.agility +
    hero.vitality +
    hero.endurance +
    hero.intelligence +
    hero.wisdom +
    hero.luck +
    hero.dexterity
  );
}

// Get ability name from ID (placeholder - can be enhanced with actual ability mapping)
function getAbilityName(abilityId: number | undefined): string | null {
  if (abilityId === undefined || abilityId === null) return null;
  // TODO: Map ability IDs to names from DFK ability catalog
  return `ability_${abilityId}`;
}

// Process a single battle and store tournament/placement/snapshot data
async function processBattle(battle: Battle, realm: RealmType = 'cv'): Promise<{ placements: number; snapshots: number }> {
  let placementsAdded = 0;
  let snapshotsAdded = 0;
  
  const battleId = parseInt(battle.id);
  const partySize = getPartySize(Math.max(battle.hostHeroes.length, battle.opponentHeroes.length));
  const format = getFormat(partySize);
  
  // Determine winner and loser
  const isHostWinner = battle.winner?.id.toLowerCase() === battle.host.id.toLowerCase();
  const winnerPlayer = isHostWinner ? battle.host : battle.opponent;
  const loserPlayer = isHostWinner ? battle.opponent : battle.host;
  const winnerHeroes = isHostWinner ? battle.hostHeroes : battle.opponentHeroes;
  const loserHeroes = isHostWinner ? battle.opponentHeroes : battle.hostHeroes;
  
  // Only index completed battles with a winner
  if (!battle.winner) {
    return { placements: 0, snapshots: 0 };
  }
  
  try {
    // Insert or update tournament record
    await db.insert(pvpTournaments).values({
      tournamentId: battleId,
      realm: realm,
      name: `Battle #${battleId}`,
      format,
      status: 'completed',
      startTime: new Date(battle.battleStartTime * 1000),
      endTime: new Date(battle.battleStartTime * 1000),
      levelMin: battle.minLevel,
      levelMax: battle.maxLevel,
      rarityMin: battle.minRarity,
      rarityMax: battle.maxRarity,
      partySize,
      totalEntrants: 2,
      totalRounds: 1,
      lastIndexedAt: new Date(),
    }).onConflictDoNothing();
    
    // Process winner heroes as "winners"
    for (let i = 0; i < winnerHeroes.length; i++) {
      const hero = winnerHeroes[i];
      const heroId = parseInt(hero.id);
      
      // Insert placement
      const [placement] = await db.insert(tournamentPlacements).values({
        tournamentId: battleId,
        heroId,
        playerAddress: winnerPlayer.id.toLowerCase(),
        placement: 'winner',
        placementRank: 1,
        teamIndex: i,
        teamId: `${battleId}-winner`,
        matchesWon: 1,
        matchesLost: 0,
      }).onConflictDoNothing().returning();
      
      if (placement) {
        placementsAdded++;
        
        // Insert hero snapshot with realm for marketplace location
        await db.insert(heroTournamentSnapshots).values({
          placementId: placement.id,
          heroId,
          tournamentId: battleId,
          realm: realm,
          rarity: hero.rarity,
          mainClass: hero.mainClassStr,
          subClass: hero.subClassStr,
          level: hero.level,
          generation: hero.generation,
          strength: hero.strength,
          agility: hero.agility,
          dexterity: hero.dexterity,
          vitality: hero.vitality,
          endurance: hero.endurance,
          intelligence: hero.intelligence,
          wisdom: hero.wisdom,
          luck: hero.luck,
          hp: hero.hp,
          mp: hero.mp,
          stamina: hero.stamina,
          active1: getAbilityName(hero.active1),
          active2: getAbilityName(hero.active2),
          passive1: getAbilityName(hero.passive1),
          passive2: getAbilityName(hero.passive2),
          summonsRemaining: hero.summonsRemaining,
          maxSummons: hero.maxSummons,
          combatPowerScore: computeCombatPowerScore(hero),
          rawHeroData: hero,
        });
        snapshotsAdded++;
      }
    }
    
    // Process loser heroes as "finalists" (they made it to the finals but lost)
    for (let i = 0; i < loserHeroes.length; i++) {
      const hero = loserHeroes[i];
      const heroId = parseInt(hero.id);
      
      // Insert placement
      const [placement] = await db.insert(tournamentPlacements).values({
        tournamentId: battleId,
        heroId,
        playerAddress: loserPlayer.id.toLowerCase(),
        placement: 'finalist',
        placementRank: 2,
        teamIndex: i,
        teamId: `${battleId}-finalist`,
        matchesWon: 0,
        matchesLost: 1,
      }).onConflictDoNothing().returning();
      
      if (placement) {
        placementsAdded++;
        
        // Insert hero snapshot with realm for marketplace location
        await db.insert(heroTournamentSnapshots).values({
          placementId: placement.id,
          heroId,
          tournamentId: battleId,
          realm: realm,
          rarity: hero.rarity,
          mainClass: hero.mainClassStr,
          subClass: hero.subClassStr,
          level: hero.level,
          generation: hero.generation,
          strength: hero.strength,
          agility: hero.agility,
          dexterity: hero.dexterity,
          vitality: hero.vitality,
          endurance: hero.endurance,
          intelligence: hero.intelligence,
          wisdom: hero.wisdom,
          luck: hero.luck,
          hp: hero.hp,
          mp: hero.mp,
          stamina: hero.stamina,
          active1: getAbilityName(hero.active1),
          active2: getAbilityName(hero.active2),
          passive1: getAbilityName(hero.passive1),
          passive2: getAbilityName(hero.passive2),
          summonsRemaining: hero.summonsRemaining,
          maxSummons: hero.maxSummons,
          combatPowerScore: computeCombatPowerScore(hero),
          rawHeroData: hero,
        });
        snapshotsAdded++;
      }
    }
  } catch (error) {
    console.error(`[TournamentIndexer] Error processing battle ${battleId}:`, error);
  }
  
  return { placements: placementsAdded, snapshots: snapshotsAdded };
}

// ============================================================
// SHARED WORK QUEUE FOR WORKERS
// ============================================================

interface WorkItem {
  skip: number;
  batchSize: number;
}

let workQueue: WorkItem[] = [];
let workQueueLock = false;

// Get next work item from queue (thread-safe via lock)
async function getNextWorkItem(): Promise<WorkItem | null> {
  while (workQueueLock) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  workQueueLock = true;
  const item = workQueue.shift() || null;
  workQueueLock = false;
  return item;
}

// Work-stealing: Find a worker with remaining work and take some
function stealWork(thiefId: number): WorkItem | null {
  // Find worker with most remaining range
  let bestDonor: WorkerState | null = null;
  let maxRemaining = 0;
  
  for (const worker of indexerState.workers) {
    if (worker.id === thiefId) continue;
    if (worker.status !== 'working') continue;
    
    const remaining = worker.currentBatchEnd - worker.currentBatchStart;
    if (remaining > maxRemaining && remaining > BATCH_SIZE * 2) {
      maxRemaining = remaining;
      bestDonor = worker;
    }
  }
  
  if (bestDonor && maxRemaining > BATCH_SIZE) {
    // Steal half of remaining work
    const stolenStart = bestDonor.currentBatchEnd - Math.floor(maxRemaining / 2);
    const stolenBatch = bestDonor.currentBatchEnd - stolenStart;
    bestDonor.currentBatchEnd = stolenStart;
    
    console.log(`[TournamentIndexer] Worker ${thiefId} stealing ${stolenBatch} items from worker ${bestDonor.id}`);
    return { skip: stolenStart, batchSize: stolenBatch };
  }
  
  return null;
}

// Worker function - processes battles from queue
async function runWorker(workerId: number, dbProgress: typeof tournamentIndexerProgress.$inferSelect, realm: RealmType): Promise<void> {
  const worker = indexerState.workers[workerId];
  if (!worker) return;
  
  worker.status = 'working';
  
  while (indexerState.isRunning) {
    // Try to get work from queue
    let workItem = await getNextWorkItem();
    
    // If queue is empty, try work-stealing
    if (!workItem) {
      worker.status = 'stealing';
      workItem = stealWork(workerId);
      
      if (!workItem) {
        // No work available, worker is done
        worker.status = 'done';
        return;
      }
    }
    
    worker.status = 'working';
    worker.currentBatchStart = workItem.skip;
    worker.currentBatchEnd = workItem.skip + workItem.batchSize;
    
    try {
      const data = await client.request<{ battles: Battle[] }>(BATTLES_QUERY, {
        first: workItem.batchSize,
        skip: workItem.skip,
        where: { winner_not: null },
      });
      
      if (!data.battles || data.battles.length === 0) {
        continue;
      }
      
      for (const battle of data.battles) {
        if (!indexerState.isRunning) break;
        
        // Pass realm to processBattle for proper marketplace tracking
        const result = await processBattle(battle, realm);
        
        // Update worker state
        worker.battlesProcessed++;
        worker.lastBattleId = parseInt(battle.id);
        
        // Update global state
        indexerState.battlesProcessed++;
        indexerState.placementsIndexed += result.placements;
        indexerState.snapshotsIndexed += result.snapshots;
        
        // Update throughput every 10 battles
        if (indexerState.battlesProcessed % 10 === 0) {
          updateThroughput();
          
          // Persist progress for this realm
          await updateProgress(realm, {
            lastTournamentId: worker.lastBattleId,
            tournamentsIndexed: (dbProgress.tournamentsIndexed || 0) + indexerState.battlesProcessed,
            placementsIndexed: (dbProgress.placementsIndexed || 0) + indexerState.placementsIndexed,
            snapshotsIndexed: (dbProgress.snapshotsIndexed || 0) + indexerState.snapshotsIndexed,
            lastRunAt: new Date(),
          });
        }
      }
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, WORKER_DELAY_MS));
      
    } catch (error) {
      worker.errors++;
      console.error(`[TournamentIndexer] Worker ${workerId} error:`, error);
      
      // Re-queue failed work if not too many errors
      if (worker.errors < 3) {
        workQueue.push(workItem);
      }
    }
  }
  
  worker.status = 'done';
}

// Main indexer function with parallel workers
// realm: 'cv' = Crystalvale Tavern, 'sd' = Serendale/Sundered Isles Barkeep
export async function runTournamentIndexer(maxBattles: number = 500, realm: RealmType = 'cv'): Promise<{
  battlesProcessed: number;
  placementsIndexed: number;
  snapshotsIndexed: number;
  realm: RealmType;
}> {
  if (indexerState.isRunning) {
    console.log('[TournamentIndexer] Already running, skipping');
    return {
      battlesProcessed: 0,
      placementsIndexed: 0,
      snapshotsIndexed: 0,
      realm,
    };
  }
  
  const realmName = REALM_DISPLAY_NAMES[realm] || realm;
  console.log(`[TournamentIndexer] Starting ${realmName} with ${NUM_WORKERS} workers for ${maxBattles} battles...`);
  
  const dbProgress = await getProgress(realm);
  await updateProgress(realm, { status: 'running', lastError: null });
  
  // Reset state
  indexerState.isRunning = true;
  indexerState.startedAt = new Date();
  indexerState.totalBattlesToProcess = maxBattles;
  indexerState.battlesProcessed = 0;
  indexerState.placementsIndexed = 0;
  indexerState.snapshotsIndexed = 0;
  indexerState.throughputPerMinute = 0;
  indexerState.estimatedSecondsRemaining = null;
  indexerState.recentProcessCounts = [];
  
  initializeWorkers(NUM_WORKERS);
  
  // Build work queue - divide work across batches
  workQueue = [];
  const batchesNeeded = Math.ceil(maxBattles / BATCH_SIZE);
  for (let i = 0; i < batchesNeeded; i++) {
    const skip = i * BATCH_SIZE;
    const batchSize = Math.min(BATCH_SIZE, maxBattles - skip);
    workQueue.push({ skip, batchSize });
  }
  
  console.log(`[TournamentIndexer] Created ${workQueue.length} work items for ${NUM_WORKERS} workers`);
  
  try {
    // Start all workers in parallel with realm context
    const workerPromises = Array.from({ length: NUM_WORKERS }, (_, i) => 
      runWorker(i, dbProgress, realm)
    );
    
    await Promise.all(workerPromises);
    
    // Final progress update
    await updateProgress(realm, {
      status: 'idle',
      tournamentsIndexed: (dbProgress.tournamentsIndexed || 0) + indexerState.battlesProcessed,
      placementsIndexed: (dbProgress.placementsIndexed || 0) + indexerState.placementsIndexed,
      snapshotsIndexed: (dbProgress.snapshotsIndexed || 0) + indexerState.snapshotsIndexed,
      lastRunAt: new Date(),
    });
    
    console.log(`[TournamentIndexer] Complete (${realmName}). Processed ${indexerState.battlesProcessed} battles, ${indexerState.placementsIndexed} placements, ${indexerState.snapshotsIndexed} snapshots`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[TournamentIndexer] Error:', errorMessage);
    await updateProgress(realm, { status: 'error', lastError: errorMessage });
  } finally {
    indexerState.isRunning = false;
  }
  
  return {
    battlesProcessed: indexerState.battlesProcessed,
    placementsIndexed: indexerState.placementsIndexed,
    snapshotsIndexed: indexerState.snapshotsIndexed,
    realm,
  };
}

// Stop the indexer
export function stopTournamentIndexer(): { stopped: boolean } {
  if (!indexerState.isRunning) {
    return { stopped: false };
  }
  
  console.log('[TournamentIndexer] Stopping...');
  indexerState.isRunning = false;
  return { stopped: true };
}

// ============================================================
// AUTO-RUN FUNCTIONALITY
// ============================================================

// Auto-run for both realms - alternates between Crystalvale and Serendale
export function startAutoRun(options: { maxBattlesPerRun?: number; realm?: RealmType } = {}): { status: string } {
  if (autoRunInterval) {
    return { status: 'already_running' };
  }
  
  const maxBattles = options.maxBattlesPerRun || 200;
  const targetRealm = options.realm; // undefined means alternate both realms
  let currentRealmIndex = 0;
  
  const getNextRealm = (): RealmType => {
    if (targetRealm) return targetRealm;
    const realm = SUPPORTED_REALMS[currentRealmIndex];
    currentRealmIndex = (currentRealmIndex + 1) % SUPPORTED_REALMS.length;
    return realm;
  };
  
  const realmInfo = targetRealm ? REALM_DISPLAY_NAMES[targetRealm] : 'both realms (alternating)';
  console.log(`[TournamentIndexer] Starting auto-run for ${realmInfo} (${maxBattles} battles every ${AUTO_RUN_INTERVAL_MS / 1000}s)`);
  
  // Run immediately
  const firstRealm = getNextRealm();
  runTournamentIndexer(maxBattles, firstRealm).catch(err => 
    console.error(`[TournamentIndexer] Auto-run error (${firstRealm}):`, err)
  );
  
  // Schedule periodic runs - alternates realms
  autoRunInterval = setInterval(() => {
    if (!indexerState.isRunning) {
      const realm = getNextRealm();
      runTournamentIndexer(maxBattles, realm).catch(err => 
        console.error(`[TournamentIndexer] Auto-run error (${realm}):`, err)
      );
    }
  }, AUTO_RUN_INTERVAL_MS);
  
  return { status: 'started' };
}

export function stopAutoRun(): { status: string } {
  if (!autoRunInterval) {
    return { status: 'not_running' };
  }
  
  clearInterval(autoRunInterval);
  autoRunInterval = null;
  stopTournamentIndexer();
  
  console.log('[TournamentIndexer] Auto-run stopped');
  return { status: 'stopped' };
}

export function isAutoRunActive(): boolean {
  return autoRunInterval !== null;
}

// Get live indexer state (including workers and ETA)
export function getLiveIndexerState() {
  // Defensive: ensure workers array exists
  const workers = (indexerState.workers || []).map(w => ({
    id: w.id,
    status: w.status,
    battlesProcessed: w.battlesProcessed,
    lastBattleId: w.lastBattleId,
    errors: w.errors,
  }));
  
  return {
    isRunning: indexerState.isRunning,
    isAutoRunning: isAutoRunActive(),
    startedAt: indexerState.startedAt?.toISOString() || null,
    totalBattlesToProcess: indexerState.totalBattlesToProcess,
    battlesProcessed: indexerState.battlesProcessed,
    placementsIndexed: indexerState.placementsIndexed,
    snapshotsIndexed: indexerState.snapshotsIndexed,
    throughputPerMinute: indexerState.throughputPerMinute,
    estimatedSecondsRemaining: indexerState.estimatedSecondsRemaining,
    workers,
    workQueueSize: workQueue?.length || 0,
  };
}

// Get indexer status
export async function getTournamentIndexerStatus() {
  const progress = await getProgress();
  
  // Get counts
  const [tournamentCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pvpTournaments);
  
  const [placementCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(tournamentPlacements);
  
  const [snapshotCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(heroTournamentSnapshots);
  
  // Get placement breakdown
  const placementBreakdown = await db
    .select({
      placement: tournamentPlacements.placement,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(tournamentPlacements)
    .groupBy(tournamentPlacements.placement);
  
  return {
    progress,
    stats: {
      tournaments: tournamentCount?.count || 0,
      placements: placementCount?.count || 0,
      snapshots: snapshotCount?.count || 0,
      placementBreakdown: placementBreakdown.reduce((acc, row) => {
        acc[row.placement] = row.count;
        return acc;
      }, {} as Record<string, number>),
    },
  };
}

// Get recent tournaments with requirements
export async function getRecentTournaments(limit: number = 20) {
  return db
    .select()
    .from(pvpTournaments)
    .orderBy(desc(pvpTournaments.tournamentId))
    .limit(limit);
}

// Get winner snapshots for a tournament format
export async function getWinnerSnapshots(options: {
  format?: string;
  levelMin?: number;
  levelMax?: number;
  rarityMin?: number;
  rarityMax?: number;
  placement?: string;
  limit?: number;
}) {
  const { format, levelMin, levelMax, rarityMin, rarityMax, placement = 'winner', limit = 100 } = options;
  
  let query = db
    .select({
      snapshot: heroTournamentSnapshots,
      tournament: pvpTournaments,
      placement: tournamentPlacements,
    })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .innerJoin(pvpTournaments, eq(tournamentPlacements.tournamentId, pvpTournaments.tournamentId))
    .where(eq(tournamentPlacements.placement, placement))
    .orderBy(desc(pvpTournaments.tournamentId))
    .limit(limit);
  
  return query;
}
