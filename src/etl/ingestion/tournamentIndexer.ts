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
import { eq, sql, desc, and, gte, lte } from 'drizzle-orm';

// GraphQL endpoint for DFK battles
// Note: All PvP battles use the same DFK API endpoint. The "realm" parameter indicates 
// which marketplace to search for similar heroes (cv = Crystalvale Tavern, sd = Sundered Isles Barkeep).
// PvP battles themselves only happen in Sundered Isles arena, but heroes can be purchased from either tavern.
const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';

// Realm display names for user-facing messages
export const REALM_DISPLAY_NAMES: Record<string, string> = {
  cv: 'Crystalvale Tavern',
  sd: 'Sundered Isles Barkeep',
};

// Create a new client for each request to ensure clean state
function getClient(): GraphQLClient {
  return new GraphQLClient(DFK_GRAPHQL_ENDPOINT);
}

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
// Uses CREATE TABLE IF NOT EXISTS for each table to handle partial states
let tablesInitialized = false;
async function ensureTablesExist() {
  if (tablesInitialized) return;
  
  console.log('[TournamentIndexer] Ensuring all tournament tables exist...');
  
  // Create progress table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tournament_indexer_progress (
      id SERIAL PRIMARY KEY,
      realm TEXT NOT NULL DEFAULT 'cv',
      last_tournament_id INTEGER NOT NULL DEFAULT 0,
      tournaments_indexed INTEGER NOT NULL DEFAULT 0,
      placements_indexed INTEGER NOT NULL DEFAULT 0,
      snapshots_indexed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle',
      last_error TEXT,
      last_run_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  
  // Create tournaments table (matches shared/schema.ts pvpTournaments with all restriction fields)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pvp_tournaments (
      id SERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL UNIQUE,
      realm TEXT NOT NULL DEFAULT 'cv',
      name TEXT,
      format TEXT NOT NULL DEFAULT '3v3',
      status TEXT NOT NULL DEFAULT 'completed',
      party_size INTEGER NOT NULL DEFAULT 3,
      level_min INTEGER,
      level_max INTEGER,
      rarity_min INTEGER,
      rarity_max INTEGER,
      excluded_classes INTEGER DEFAULT 0,
      excluded_consumables INTEGER DEFAULT 0,
      excluded_origin INTEGER DEFAULT 0,
      all_unique_classes BOOLEAN DEFAULT false,
      no_triple_classes BOOLEAN DEFAULT false,
      must_include_class BOOLEAN DEFAULT false,
      included_class_id INTEGER,
      battle_inventory INTEGER,
      battle_budget INTEGER,
      min_hero_stat_score INTEGER DEFAULT 0,
      max_hero_stat_score INTEGER DEFAULT 3000,
      min_team_stat_score INTEGER DEFAULT 0,
      max_team_stat_score INTEGER DEFAULT 9000,
      shot_clock_duration INTEGER DEFAULT 45,
      private_battle BOOLEAN DEFAULT false,
      map_id INTEGER,
      glory_bout BOOLEAN DEFAULT false,
      tournament_type_signature TEXT,
      min_glories INTEGER DEFAULT 0,
      host_glories INTEGER DEFAULT 0,
      opponent_glories INTEGER DEFAULT 0,
      sponsor_count INTEGER DEFAULT 0,
      rewards_json JSONB,
      sponsors_json JSONB,
      host_player TEXT,
      opponent_player TEXT,
      winner_player TEXT,
      start_time TIMESTAMP WITH TIME ZONE,
      end_time TIMESTAMP WITH TIME ZONE,
      total_entrants INTEGER DEFAULT 0,
      total_rounds INTEGER,
      raw_battle_data JSONB,
      last_indexed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  
  // Add new restriction columns if table already exists (migration for existing installations)
  const restrictionColumns = [
    { name: 'excluded_classes', type: 'INTEGER DEFAULT 0' },
    { name: 'excluded_consumables', type: 'INTEGER DEFAULT 0' },
    { name: 'excluded_origin', type: 'INTEGER DEFAULT 0' },
    { name: 'all_unique_classes', type: 'BOOLEAN DEFAULT false' },
    { name: 'no_triple_classes', type: 'BOOLEAN DEFAULT false' },
    { name: 'must_include_class', type: 'BOOLEAN DEFAULT false' },
    { name: 'included_class_id', type: 'INTEGER' },
    { name: 'battle_inventory', type: 'INTEGER' },
    { name: 'battle_budget', type: 'INTEGER' },
    { name: 'min_hero_stat_score', type: 'INTEGER DEFAULT 0' },
    { name: 'max_hero_stat_score', type: 'INTEGER DEFAULT 3000' },
    { name: 'min_team_stat_score', type: 'INTEGER DEFAULT 0' },
    { name: 'max_team_stat_score', type: 'INTEGER DEFAULT 9000' },
    { name: 'shot_clock_duration', type: 'INTEGER DEFAULT 45' },
    { name: 'private_battle', type: 'BOOLEAN DEFAULT false' },
    { name: 'map_id', type: 'INTEGER' },
    { name: 'glory_bout', type: 'BOOLEAN DEFAULT false' },
    { name: 'tournament_type_signature', type: 'TEXT' },
    { name: 'min_glories', type: 'INTEGER DEFAULT 0' },
    { name: 'host_glories', type: 'INTEGER DEFAULT 0' },
    { name: 'opponent_glories', type: 'INTEGER DEFAULT 0' },
    { name: 'sponsor_count', type: 'INTEGER DEFAULT 0' },
    { name: 'rewards_json', type: 'JSONB' },
    { name: 'sponsors_json', type: 'JSONB' },
  ];
  
  for (const col of restrictionColumns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE pvp_tournaments ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`));
    } catch (e) {
      // Column might already exist, ignore
    }
  }
  
  // Create indexes for tournament queries
  await db.execute(sql`CREATE INDEX IF NOT EXISTS pvp_tournaments_signature_idx ON pvp_tournaments(tournament_type_signature)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS pvp_tournaments_level_bracket_idx ON pvp_tournaments(level_min, level_max)`);
  
  // Create placements table (matches shared/schema.ts tournamentPlacements)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS tournament_placements (
      id SERIAL PRIMARY KEY,
      tournament_id BIGINT NOT NULL,
      hero_id BIGINT NOT NULL,
      player_address TEXT,
      placement TEXT NOT NULL,
      placement_rank INTEGER DEFAULT 1,
      team_index INTEGER,
      team_id TEXT,
      matches_won INTEGER DEFAULT 0,
      matches_lost INTEGER DEFAULT 0,
      total_damage_dealt BIGINT DEFAULT 0,
      total_damage_taken BIGINT DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(tournament_id, hero_id)
    )
  `);
  
  // Create indexes for placements
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tournament_placements_hero_idx ON tournament_placements(hero_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tournament_placements_player_idx ON tournament_placements(player_address)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS tournament_placements_placement_idx ON tournament_placements(placement)`);
  
  // Create snapshots table (matches shared/schema.ts heroTournamentSnapshots)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS hero_tournament_snapshots (
      id SERIAL PRIMARY KEY,
      placement_id INTEGER NOT NULL REFERENCES tournament_placements(id),
      hero_id BIGINT NOT NULL,
      tournament_id BIGINT NOT NULL,
      realm TEXT NOT NULL DEFAULT 'cv',
      rarity INTEGER NOT NULL,
      main_class TEXT NOT NULL,
      sub_class TEXT NOT NULL,
      level INTEGER NOT NULL,
      generation INTEGER,
      strength INTEGER NOT NULL,
      agility INTEGER NOT NULL,
      dexterity INTEGER NOT NULL,
      vitality INTEGER NOT NULL,
      endurance INTEGER NOT NULL,
      intelligence INTEGER NOT NULL,
      wisdom INTEGER NOT NULL,
      luck INTEGER NOT NULL,
      hp INTEGER,
      mp INTEGER,
      stamina INTEGER,
      active1 TEXT,
      active2 TEXT,
      passive1 TEXT,
      passive2 TEXT,
      stat_genes JSONB,
      basic_gene_count INTEGER DEFAULT 0,
      advanced_gene_count INTEGER DEFAULT 0,
      elite_gene_count INTEGER DEFAULT 0,
      exalted_gene_count INTEGER DEFAULT 0,
      equipment JSONB,
      summons_remaining INTEGER,
      max_summons INTEGER,
      combat_power_score INTEGER,
      raw_hero_data JSONB,
      snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  
  // Create indexes for snapshots
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hero_tournament_snapshots_placement_idx ON hero_tournament_snapshots(placement_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hero_tournament_snapshots_hero_idx ON hero_tournament_snapshots(hero_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hero_tournament_snapshots_tournament_idx ON hero_tournament_snapshots(tournament_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hero_tournament_snapshots_class_idx ON hero_tournament_snapshots(main_class)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS hero_tournament_snapshots_level_rarity_idx ON hero_tournament_snapshots(level, rarity)`);
  
  // Create similarity config table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pvp_similarity_config (
      id SERIAL PRIMARY KEY,
      config_name TEXT NOT NULL DEFAULT 'default' UNIQUE,
      stats_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.40,
      active_abilities_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.25,
      passive_abilities_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.15,
      class_match_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.10,
      rarity_match_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
      gene_quality_weight NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
      stat_weights JSONB DEFAULT '{"strength":0.15,"agility":0.15,"dexterity":0.10,"vitality":0.15,"endurance":0.10,"intelligence":0.15,"wisdom":0.10,"luck":0.10}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  
  console.log('[TournamentIndexer] Tournament tables ready');
  tablesInitialized = true;
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

// GraphQL query for battles with hero data and full tournament restrictions
// Note: We can't filter by winner_not:null in the API, so we filter completed battles in code
const BATTLES_QUERY = gql`
  query GetBattles($first: Int!, $skip: Int!) {
    battles(first: $first, skip: $skip, orderBy: id, orderDirection: desc) {
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
      battleState
      minLevel
      maxLevel
      minRarity
      maxRarity
      partyCount
      excludedClasses
      excludedConsumables
      excludedOrigin
      allUniqueClasses
      noTripleClasses
      mustIncludeClass1
      includedClass1
      battleInventory
      battleBudget
      minHeroStatScore
      maxHeroStatScore
      minTeamStatScore
      maxTeamStatScore
      shotClockDuration
      privateBattle
      mapId
      gloryBout
      minGlories
      hostGlories
      opponentGlories
      sponsorCount
      rewards {
        token
        isGasToken
        totalAmount
      }
      sponsors {
        token
        isGasToken
        amount
        sponsor {
          id
          name
        }
      }
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

interface BattleReward {
  token: string;
  isGasToken: boolean;
  totalAmount: string;
}

interface BattleSponsor {
  token: string;
  isGasToken: boolean;
  amount: string;
  sponsor: { id: string; name: string } | null;
}

interface Battle {
  id: string;
  host: { id: string; name: string };
  opponent: { id: string; name: string };
  winner: { id: string; name: string } | null;
  battleStartTime: number;
  battleState: number; // 5 = completed
  minLevel: number;
  maxLevel: number;
  minRarity: number;
  maxRarity: number;
  // Tournament restrictions
  partyCount: number; // 1, 3, or 6 for party size
  excludedClasses: number; // bitmask of excluded class IDs
  excludedConsumables: number; // bitmask of excluded consumable IDs
  excludedOrigin: number; // bitmask of excluded equipment origins
  allUniqueClasses: boolean; // All Unique Classes requirement
  noTripleClasses: boolean; // No Triple Classes requirement
  mustIncludeClass1: boolean | null; // Must include specific class
  includedClass1: number | null; // Required class ID
  battleInventory: number; // Equipment rules
  battleBudget: number; // Combat budget
  minHeroStatScore: number; // Min hero stat score
  maxHeroStatScore: number; // Max hero stat score
  minTeamStatScore: number; // Min team stat score
  maxTeamStatScore: number; // Max team stat score
  shotClockDuration: number; // Turn timer in seconds
  privateBattle: boolean; // Private battle flag
  mapId: number; // Battle map
  gloryBout: boolean | null; // Glory bout flag
  // Entry fee and rewards
  minGlories: number; // Entry fee in glories
  hostGlories: number; // Glories staked by host
  opponentGlories: number; // Glories staked by opponent
  sponsorCount: number; // Number of sponsors
  rewards: BattleReward[] | null; // Prize rewards
  sponsors: BattleSponsor[] | null; // Sponsor rewards
  hostHeroes: BattleHero[];
  opponentHeroes: BattleHero[];
}

// Generate a tournament type signature for grouping similar tournaments
function generateTournamentSignature(battle: Battle): string {
  const parts = [
    `lv${battle.minLevel}-${battle.maxLevel}`,
    `r${battle.minRarity}-${battle.maxRarity}`,
    `p${battle.partyCount}`,
    battle.allUniqueClasses ? 'unique' : '',
    battle.noTripleClasses ? 'no3x' : '',
    battle.excludedClasses > 0 ? `excl${battle.excludedClasses}` : '',
    battle.excludedConsumables > 0 ? `cons${battle.excludedConsumables}` : '',
    battle.excludedOrigin > 0 ? `orig${battle.excludedOrigin}` : '',
    battle.includedClass1 ? `inc${battle.includedClass1}` : '',
    `stat${battle.minHeroStatScore}-${battle.maxHeroStatScore}`,
    `team${battle.minTeamStatScore}-${battle.maxTeamStatScore}`,
  ].filter(p => p !== '');
  return parts.join('_');
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
    // Generate tournament type signature for grouping similar tournaments
    const signature = generateTournamentSignature(battle);
    
    // Insert or update tournament record with all restriction fields
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
      partySize: battle.partyCount || partySize,
      // Tournament restrictions from DFK API
      excludedClasses: battle.excludedClasses || 0,
      excludedConsumables: battle.excludedConsumables || 0,
      excludedOrigin: battle.excludedOrigin || 0,
      allUniqueClasses: battle.allUniqueClasses || false,
      noTripleClasses: battle.noTripleClasses || false,
      mustIncludeClass: battle.mustIncludeClass1 || false,
      includedClassId: battle.includedClass1,
      battleInventory: battle.battleInventory,
      battleBudget: battle.battleBudget,
      minHeroStatScore: battle.minHeroStatScore || 0,
      maxHeroStatScore: battle.maxHeroStatScore || 3000,
      minTeamStatScore: battle.minTeamStatScore || 0,
      maxTeamStatScore: battle.maxTeamStatScore || 9000,
      shotClockDuration: battle.shotClockDuration || 45,
      privateBattle: battle.privateBattle || false,
      mapId: battle.mapId,
      gloryBout: battle.gloryBout || false,
      tournamentTypeSignature: signature,
      // Entry fee and rewards
      minGlories: battle.minGlories || 0,
      hostGlories: battle.hostGlories || 0,
      opponentGlories: battle.opponentGlories || 0,
      sponsorCount: battle.sponsorCount || 0,
      rewardsJson: battle.rewards || null,
      sponsorsJson: battle.sponsors || null,
      // Player info
      hostPlayer: battle.host.id.toLowerCase(),
      opponentPlayer: battle.opponent.id.toLowerCase(),
      winnerPlayer: battle.winner.id.toLowerCase(),
      totalEntrants: 2,
      totalRounds: 1,
      rawBattleData: battle,
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
      const data = await getClient().request<{ battles: Battle[] }>(BATTLES_QUERY, {
        first: workItem.batchSize,
        skip: workItem.skip,
      });
      
      if (!data.battles || data.battles.length === 0) {
        continue;
      }
      
      // Filter to only completed battles (battleState=5) with a winner
      const completedBattles = data.battles.filter(b => b.battleState === 5 && b.winner !== null);
      
      for (const battle of completedBattles) {
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
      placementBreakdown: placementBreakdown.reduce((acc: Record<string, number>, row: { placement: string; count: number }) => {
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

// Get winner snapshots for a tournament format with optional class filtering
export async function getWinnerSnapshots(options: {
  format?: string;
  mainClass?: string;
  levelMin?: number;
  levelMax?: number;
  rarityMin?: number;
  rarityMax?: number;
  placement?: string;
  limit?: number;
}) {
  const { format, mainClass, levelMin, levelMax, rarityMin, rarityMax, placement = 'winner', limit = 100 } = options;
  
  // Build conditions
  const conditions = [eq(tournamentPlacements.placement, placement)];
  if (mainClass) {
    conditions.push(eq(heroTournamentSnapshots.mainClass, mainClass));
  }
  
  let query = db
    .select({
      snapshot: heroTournamentSnapshots,
      tournament: pvpTournaments,
      placement: tournamentPlacements,
    })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .innerJoin(pvpTournaments, eq(tournamentPlacements.tournamentId, pvpTournaments.tournamentId))
    .where(and(...conditions))
    .orderBy(desc(pvpTournaments.tournamentId))
    .limit(limit);
  
  return query;
}

// Get tournaments grouped by signature (for "Similar Tournaments" feature)
export async function getTournamentsBySignature(signature: string, limit: number = 50) {
  return db
    .select()
    .from(pvpTournaments)
    .where(eq(pvpTournaments.tournamentTypeSignature, signature))
    .orderBy(desc(pvpTournaments.tournamentId))
    .limit(limit);
}

// Get unique tournament type signatures with counts
export async function getTournamentSignatures(limit: number = 100) {
  return db
    .select({
      signature: pvpTournaments.tournamentTypeSignature,
      count: sql<number>`COUNT(*)::int`,
      latestTournamentId: sql<number>`MAX(tournament_id)::int`,
    })
    .from(pvpTournaments)
    .where(sql`${pvpTournaments.tournamentTypeSignature} IS NOT NULL`)
    .groupBy(pvpTournaments.tournamentTypeSignature)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);
}

// Get full tournament details with restrictions by ID
export async function getTournamentDetails(tournamentId: number) {
  const [tournament] = await db
    .select()
    .from(pvpTournaments)
    .where(eq(pvpTournaments.tournamentId, tournamentId))
    .limit(1);
  
  if (!tournament) return null;
  
  // Get placements and snapshots for this tournament
  const placements = await db
    .select({
      placement: tournamentPlacements,
      snapshot: heroTournamentSnapshots,
    })
    .from(tournamentPlacements)
    .innerJoin(heroTournamentSnapshots, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .where(eq(tournamentPlacements.tournamentId, tournamentId));
  
  return {
    tournament,
    placements,
  };
}

// Get tournament restriction summary for dashboard
export async function getTournamentRestrictionStats() {
  // Get counts of different restriction types used
  const [stats] = await db
    .select({
      totalTournaments: sql<number>`COUNT(*)::int`,
      withExcludedClasses: sql<number>`SUM(CASE WHEN excluded_classes > 0 THEN 1 ELSE 0 END)::int`,
      withExcludedConsumables: sql<number>`SUM(CASE WHEN excluded_consumables > 0 THEN 1 ELSE 0 END)::int`,
      withAllUniqueClasses: sql<number>`SUM(CASE WHEN all_unique_classes THEN 1 ELSE 0 END)::int`,
      withNoTripleClasses: sql<number>`SUM(CASE WHEN no_triple_classes THEN 1 ELSE 0 END)::int`,
      withMustIncludeClass: sql<number>`SUM(CASE WHEN must_include_class THEN 1 ELSE 0 END)::int`,
      privateBattles: sql<number>`SUM(CASE WHEN private_battle THEN 1 ELSE 0 END)::int`,
      gloryBouts: sql<number>`SUM(CASE WHEN glory_bout THEN 1 ELSE 0 END)::int`,
    })
    .from(pvpTournaments);
  
  // Get format breakdown
  const formatBreakdown = await db
    .select({
      format: pvpTournaments.format,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pvpTournaments)
    .groupBy(pvpTournaments.format);
  
  // Get level bracket breakdown
  const levelBrackets = await db
    .select({
      levelMin: pvpTournaments.levelMin,
      levelMax: pvpTournaments.levelMax,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pvpTournaments)
    .groupBy(pvpTournaments.levelMin, pvpTournaments.levelMax)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);
  
  return {
    ...stats,
    formatBreakdown: formatBreakdown.reduce((acc: Record<string, number>, row: { format: string | null; count: number }) => {
      acc[row.format || 'unknown'] = row.count;
      return acc;
    }, {} as Record<string, number>),
    levelBrackets,
  };
}

// ========================================
// STAT PROFILE SIMILARITY FUNCTIONS
// ========================================

// Define stat names for consistent ordering
const STAT_NAMES = ['strength', 'agility', 'dexterity', 'vitality', 'endurance', 'intelligence', 'wisdom', 'luck'] as const;
type StatName = typeof STAT_NAMES[number];

// Extract stats from a hero snapshot as a record
function extractStats(snapshot: {
  strength: number | null;
  agility: number | null;
  dexterity: number | null;
  vitality: number | null;
  endurance: number | null;
  intelligence: number | null;
  wisdom: number | null;
  luck: number | null;
}): Record<StatName, number> {
  return {
    strength: snapshot.strength || 0,
    agility: snapshot.agility || 0,
    dexterity: snapshot.dexterity || 0,
    vitality: snapshot.vitality || 0,
    endurance: snapshot.endurance || 0,
    intelligence: snapshot.intelligence || 0,
    wisdom: snapshot.wisdom || 0,
    luck: snapshot.luck || 0,
  };
}

// Get top N stats from a hero (sorted by value descending)
function getTopStats(stats: Record<StatName, number>, n: number = 4): { stat: StatName; value: number }[] {
  return Object.entries(stats)
    .map(([stat, value]) => ({ stat: stat as StatName, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

// Calculate stat profile similarity between two heroes
// Returns a score from 0-1 where 1 means identical stat distribution
export function calculateStatProfileSimilarity(
  candidateStats: Record<StatName, number>,
  winnerStats: Record<StatName, number>,
  topN: number = 4
): { score: number; details: { stat: StatName; candidateRank: number; winnerRank: number; match: boolean }[] } {
  const candidateTop = getTopStats(candidateStats, topN);
  const winnerTop = getTopStats(winnerStats, topN);
  
  // Get the stat names from winner's top stats (the benchmark)
  const winnerTopStatNames = new Set(winnerTop.map(s => s.stat));
  const candidateTopStatNames = new Set(candidateTop.map(s => s.stat));
  
  // Count how many of the candidate's top stats match the winner's top stats
  let matchCount = 0;
  const details: { stat: StatName; candidateRank: number; winnerRank: number; match: boolean }[] = [];
  
  for (const winnerStat of winnerTop) {
    const candidateRank = candidateTop.findIndex(s => s.stat === winnerStat.stat) + 1;
    const winnerRank = winnerTop.indexOf(winnerStat) + 1;
    const match = candidateTopStatNames.has(winnerStat.stat);
    
    if (match) matchCount++;
    
    details.push({
      stat: winnerStat.stat,
      candidateRank: candidateRank || topN + 1, // If not in top N, rank is N+1
      winnerRank,
      match,
    });
  }
  
  // Base score: percentage of winner's top stats that candidate also has in top N
  const baseScore = matchCount / topN;
  
  // Bonus for matching stat order (primary stat alignment)
  let orderBonus = 0;
  if (candidateTop[0]?.stat === winnerTop[0]?.stat) {
    orderBonus += 0.15; // 15% bonus for matching primary stat
  }
  if (candidateTop.length > 1 && winnerTop.length > 1 && candidateTop[1]?.stat === winnerTop[1]?.stat) {
    orderBonus += 0.10; // 10% bonus for matching secondary stat
  }
  
  const score = Math.min(1, baseScore + orderBonus);
  
  return { score, details };
}

// Get class-specific stat profile from winning heroes of that class
export async function getClassStatProfile(mainClass: string, limit: number = 50): Promise<{
  class: string;
  sampleSize: number;
  avgStats: Record<StatName, number>;
  topStatFrequency: Record<StatName, number>;
  dominantStats: StatName[];
}> {
  // Get winner snapshots for this class
  const winners = await db
    .select({
      strength: heroTournamentSnapshots.strength,
      agility: heroTournamentSnapshots.agility,
      dexterity: heroTournamentSnapshots.dexterity,
      vitality: heroTournamentSnapshots.vitality,
      endurance: heroTournamentSnapshots.endurance,
      intelligence: heroTournamentSnapshots.intelligence,
      wisdom: heroTournamentSnapshots.wisdom,
      luck: heroTournamentSnapshots.luck,
    })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .where(and(
      eq(heroTournamentSnapshots.mainClass, mainClass),
      eq(tournamentPlacements.placement, 'winner')
    ))
    .limit(limit);
  
  if (winners.length === 0) {
    return {
      class: mainClass,
      sampleSize: 0,
      avgStats: { strength: 0, agility: 0, dexterity: 0, vitality: 0, endurance: 0, intelligence: 0, wisdom: 0, luck: 0 },
      topStatFrequency: { strength: 0, agility: 0, dexterity: 0, vitality: 0, endurance: 0, intelligence: 0, wisdom: 0, luck: 0 },
      dominantStats: [],
    };
  }
  
  // Calculate average stats and top stat frequency
  const totals: Record<StatName, number> = { strength: 0, agility: 0, dexterity: 0, vitality: 0, endurance: 0, intelligence: 0, wisdom: 0, luck: 0 };
  const topFrequency: Record<StatName, number> = { strength: 0, agility: 0, dexterity: 0, vitality: 0, endurance: 0, intelligence: 0, wisdom: 0, luck: 0 };
  
  for (const winner of winners) {
    const stats = extractStats(winner);
    
    // Add to totals for averaging
    for (const stat of STAT_NAMES) {
      totals[stat] += stats[stat];
    }
    
    // Count how often each stat appears in top 4
    const topStats = getTopStats(stats, 4);
    for (const top of topStats) {
      topFrequency[top.stat]++;
    }
  }
  
  // Calculate averages
  const avgStats: Record<StatName, number> = { strength: 0, agility: 0, dexterity: 0, vitality: 0, endurance: 0, intelligence: 0, wisdom: 0, luck: 0 };
  for (const stat of STAT_NAMES) {
    avgStats[stat] = Math.round(totals[stat] / winners.length);
  }
  
  // Normalize frequency to percentage
  for (const stat of STAT_NAMES) {
    topFrequency[stat] = Math.round((topFrequency[stat] / winners.length) * 100);
  }
  
  // Get dominant stats (appear in top 4 more than 50% of the time)
  const dominantStats = STAT_NAMES
    .filter(stat => topFrequency[stat] >= 50)
    .sort((a, b) => topFrequency[b] - topFrequency[a]);
  
  return {
    class: mainClass,
    sampleSize: winners.length,
    avgStats,
    topStatFrequency: topFrequency,
    dominantStats,
  };
}

// Validate and normalize stat input from API
function normalizeTargetStats(input: unknown): Record<StatName, number> {
  const result: Record<StatName, number> = {
    strength: 0, agility: 0, dexterity: 0, vitality: 0,
    endurance: 0, intelligence: 0, wisdom: 0, luck: 0,
  };
  
  if (!input || typeof input !== 'object') return result;
  
  const inputObj = input as Record<string, unknown>;
  for (const stat of STAT_NAMES) {
    const value = inputObj[stat];
    if (typeof value === 'number' && !isNaN(value) && value >= 0) {
      result[stat] = Math.floor(value);
    } else if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        result[stat] = parsed;
      }
    }
  }
  
  return result;
}

// Find similar winning heroes by class and stat profile
export async function findSimilarWinners(
  targetClass: string,
  targetStats: Record<StatName, number> | unknown,
  options: {
    levelMin?: number;
    levelMax?: number;
    rarityMin?: number;
    rarityMax?: number;
    minSimilarity?: number;
    limit?: number;
  } = {}
): Promise<{
  snapshot: typeof heroTournamentSnapshots.$inferSelect;
  tournament: typeof pvpTournaments.$inferSelect;
  placement: typeof tournamentPlacements.$inferSelect;
  similarityScore: number;
  statMatchDetails: { stat: StatName; candidateRank: number; winnerRank: number; match: boolean }[];
}[]> {
  const { levelMin, levelMax, rarityMin, rarityMax, minSimilarity = 0.5, limit = 20 } = options;
  
  // Validate and normalize input stats
  const normalizedStats = normalizeTargetStats(targetStats);
  
  // Get all winner snapshots for this class with optional level/rarity filters
  let query = db
    .select({
      snapshot: heroTournamentSnapshots,
      tournament: pvpTournaments,
      placement: tournamentPlacements,
    })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .innerJoin(pvpTournaments, eq(tournamentPlacements.tournamentId, pvpTournaments.tournamentId))
    .where(and(
      eq(heroTournamentSnapshots.mainClass, targetClass),
      eq(tournamentPlacements.placement, 'winner'),
      levelMin !== undefined ? gte(heroTournamentSnapshots.level, levelMin) : undefined,
      levelMax !== undefined ? lte(heroTournamentSnapshots.level, levelMax) : undefined,
      rarityMin !== undefined ? gte(heroTournamentSnapshots.rarity, rarityMin) : undefined,
      rarityMax !== undefined ? lte(heroTournamentSnapshots.rarity, rarityMax) : undefined,
    ))
    .orderBy(desc(pvpTournaments.tournamentId))
    .limit(100); // Get more than needed, then filter by similarity
  
  const winners = await query;
  
  // Calculate similarity for each winner
  type WinnerWithSimilarity = {
    snapshot: typeof heroTournamentSnapshots.$inferSelect;
    tournament: typeof pvpTournaments.$inferSelect;
    placement: typeof tournamentPlacements.$inferSelect;
    similarityScore: number;
    statMatchDetails: { stat: StatName; candidateRank: number; winnerRank: number; match: boolean }[];
  };
  
  const withSimilarity: WinnerWithSimilarity[] = winners.map(w => {
    const winnerStats = extractStats(w.snapshot);
    const { score, details } = calculateStatProfileSimilarity(normalizedStats, winnerStats, 4);
    return {
      ...w,
      similarityScore: score,
      statMatchDetails: details,
    };
  });
  
  // Filter by minimum similarity and sort by score
  return withSimilarity
    .filter(w => w.similarityScore >= minSimilarity)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);
}

// Get all class stat profiles for dashboard display
export async function getAllClassStatProfiles(): Promise<{
  class: string;
  sampleSize: number;
  dominantStats: StatName[];
  topStatFrequency: Record<StatName, number>;
}[]> {
  // Get unique classes from winner snapshots
  const classes = await db
    .selectDistinct({ mainClass: heroTournamentSnapshots.mainClass })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .where(eq(tournamentPlacements.placement, 'winner'));
  
  const profiles = [];
  for (const { mainClass } of classes) {
    const profile = await getClassStatProfile(mainClass);
    if (profile.sampleSize > 0) {
      profiles.push({
        class: profile.class,
        sampleSize: profile.sampleSize,
        dominantStats: profile.dominantStats,
        topStatFrequency: profile.topStatFrequency,
      });
    }
  }
  
  // Sort by sample size descending
  return profiles.sort((a, b) => b.sampleSize - a.sampleSize);
}
