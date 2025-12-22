// src/etl/ingestion/tournamentIndexer.ts
// Indexes PVP battle data and hero snapshots for the "Battle-Ready Heroes" recommendation system
// Uses DFK GraphQL API to fetch battle results and hero data

import { GraphQLClient, gql } from 'graphql-request';
import { db } from '../../../server/db.js';
import { 
  pvpTournaments, 
  tournamentPlacements, 
  heroTournamentSnapshots,
  tournamentIndexerProgress,
} from '../../../shared/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const client = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);

const BATCH_SIZE = 50;
const INDEXER_REALM = 'cv';

// Get indexer progress
async function getProgress() {
  const result = await db
    .select()
    .from(tournamentIndexerProgress)
    .where(eq(tournamentIndexerProgress.realm, INDEXER_REALM))
    .limit(1);
  
  if (result.length === 0) {
    await db.insert(tournamentIndexerProgress).values({ realm: INDEXER_REALM });
    return { lastTournamentId: 0, tournamentsIndexed: 0, placementsIndexed: 0, snapshotsIndexed: 0 };
  }
  return result[0];
}

// Update indexer progress
async function updateProgress(updates: Partial<typeof tournamentIndexerProgress.$inferInsert>) {
  await db
    .update(tournamentIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(tournamentIndexerProgress.realm, INDEXER_REALM));
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
async function processBattle(battle: Battle): Promise<{ placements: number; snapshots: number }> {
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
      realm: INDEXER_REALM,
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
        
        // Insert hero snapshot
        await db.insert(heroTournamentSnapshots).values({
          placementId: placement.id,
          heroId,
          tournamentId: battleId,
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
        
        // Insert hero snapshot
        await db.insert(heroTournamentSnapshots).values({
          placementId: placement.id,
          heroId,
          tournamentId: battleId,
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

// Main indexer function
export async function runTournamentIndexer(maxBattles: number = 500): Promise<{
  battlesProcessed: number;
  placementsIndexed: number;
  snapshotsIndexed: number;
}> {
  console.log('[TournamentIndexer] Starting tournament indexer...');
  
  const progress = await getProgress();
  await updateProgress({ status: 'running', lastError: null });
  
  let battlesProcessed = 0;
  let totalPlacements = 0;
  let totalSnapshots = 0;
  let skip = 0;
  
  try {
    while (battlesProcessed < maxBattles) {
      const batchSize = Math.min(BATCH_SIZE, maxBattles - battlesProcessed);
      
      console.log(`[TournamentIndexer] Fetching battles ${skip} to ${skip + batchSize}...`);
      
      const data = await client.request<{ battles: Battle[] }>(BATTLES_QUERY, {
        first: batchSize,
        skip,
        where: {
          // Only completed battles
          winner_not: null,
        },
      });
      
      if (!data.battles || data.battles.length === 0) {
        console.log('[TournamentIndexer] No more battles to process');
        break;
      }
      
      for (const battle of data.battles) {
        const result = await processBattle(battle);
        totalPlacements += result.placements;
        totalSnapshots += result.snapshots;
        battlesProcessed++;
        
        // Update progress periodically
        if (battlesProcessed % 10 === 0) {
          const battleId = parseInt(battle.id);
          await updateProgress({
            lastTournamentId: battleId,
            tournamentsIndexed: (progress.tournamentsIndexed || 0) + battlesProcessed,
            placementsIndexed: (progress.placementsIndexed || 0) + totalPlacements,
            snapshotsIndexed: (progress.snapshotsIndexed || 0) + totalSnapshots,
            lastRunAt: new Date(),
          });
        }
      }
      
      skip += batchSize;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    await updateProgress({
      status: 'idle',
      tournamentsIndexed: (progress.tournamentsIndexed || 0) + battlesProcessed,
      placementsIndexed: (progress.placementsIndexed || 0) + totalPlacements,
      snapshotsIndexed: (progress.snapshotsIndexed || 0) + totalSnapshots,
      lastRunAt: new Date(),
    });
    
    console.log(`[TournamentIndexer] Complete. Processed ${battlesProcessed} battles, ${totalPlacements} placements, ${totalSnapshots} snapshots`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[TournamentIndexer] Error:', errorMessage);
    await updateProgress({ status: 'error', lastError: errorMessage });
    throw error;
  }
  
  return {
    battlesProcessed,
    placementsIndexed: totalPlacements,
    snapshotsIndexed: totalSnapshots,
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
