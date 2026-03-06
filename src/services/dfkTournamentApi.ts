// src/services/dfkTournamentApi.ts
// Fetches DFK bracket tournament data directly from on-chain via Metis RPC.
// Contract: PvP Diamond 0xc7681698B14a2381d9f1eD69FC3D27F33965b53B (Metis)

import { ethers } from 'ethers';

const METIS_RPC = 'https://andromeda.metis.io/?owner=1088';
const PVP_DIAMOND = '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Contract ABI (only what we need) ────────────────────────────────────────
const TOURNAMENT_ABI = [
  'function getActiveTournamentIds() view returns (uint256[])',
  'function getTournament(uint256 _tournamentId) view returns (tuple(uint256 tournamentStartTime, uint256 rounds, uint256 roundLength, uint256 setupTime, uint256 shotClockDuration, uint256 bankedShotClockTime, uint256 shotClockPenaltyMode, uint256 shotClockForfeitCount, uint256 suddenDeathMode, uint256 bestOf, uint256 entrants, uint256 entrantsClaimed, uint256 durabilityPerRound, uint256 lossExperience, uint256 winExperience, uint256 currentRound, uint256 remainingBoutsInRound, uint8 tournamentType, uint8 state, bool autoRandom, bool tournamentSponsored, bool tournamentHosted))',
  'function getTournamentEntrySettings(uint256 _tournamentId) view returns (tuple(uint256 entryFee, uint256 entryFeeDecimals, uint256 entryPeriodStart, uint256 minRank, uint256 maxRank, uint256 minRarity, uint256 maxRarity, uint256 battleInventory, uint256 battleBudget, uint256 minHeroStatScore, uint256 maxHeroStatScore, uint256 minTeamStatScore, uint256 maxTeamStatScore, uint256 minLevel, uint256 maxLevel, uint256 excludedClasses, uint256 excludedConsumables, uint256 excludedOrigin, uint256 partyCount, uint256 maxTraitTier, uint256 maxHeroTraitScore, uint256 maxTeamTraitScore, bool allUniqueClasses, bool noTripleClasses, bool onlyPJ, bool requiresQualifierTokens, bool requiresEquipmentQualifiers, bool requiresStateQualifiers, bool onlyBannermen, bool requiresEquipmentRestrictions))',
  'function getTournamentHostData(uint256 _tournamentId) view returns (tuple(address hostAddress, uint8 tier, uint256 imageId, uint256 backgroundId))',
];

// ─── On-chain state enum → label ─────────────────────────────────────────────
// Observed values: 1=upcoming, 2=accepting_entries, 5=in_progress
// 3=completed, 4=cancelled (inferred)
function onChainStateToLabel(
  onChainState: number,
  entryPeriodStart: number,
  now: number
): string {
  if (onChainState === 2) {
    // Could still be "upcoming" if entry period hasn't opened yet
    if (entryPeriodStart > now) return 'upcoming';
    return 'accepting_entries';
  }
  if (onChainState === 1) {
    if (entryPeriodStart > now) return 'upcoming';
    return 'accepting_entries'; // state 1 + past entry period = open but no one yet
  }
  if (onChainState === 5) return 'in_progress';
  if (onChainState === 3) return 'completed';
  if (onChainState === 4) return 'cancelled';
  // For any other state, determine by timestamps
  if (entryPeriodStart > now) return 'upcoming';
  return 'accepting_entries';
}

// ─── Tournament type labels ───────────────────────────────────────────────────
const TOURNAMENT_TYPE_LABELS: Record<number, string> = {
  0: 'Open Battle',
  1: 'Off-Season Tournament',
  2: 'Standard Open Battle',
  3: 'Glory Tournament',
  4: 'Veteran Tournament',
  5: 'Champion Tournament',
  6: 'Elite Invitational',
  7: 'Grand Prix',
};

export function tournamentTypeName(type: number | null | undefined): string {
  if (type == null) return 'Tournament';
  return TOURNAMENT_TYPE_LABELS[type] ?? `Tournament Type ${type}`;
}

// ─── Host tier labels ─────────────────────────────────────────────────────────
const HOST_TIER_LABELS: Record<number, string> = {
  0: 'Basic',
  1: 'Silver',
  2: 'Gold',
  3: 'Platinum',
  4: 'Diamond',
  5: 'Champion',
};

// ─── State label (re-exported for legacy callers) ─────────────────────────────
export function tournamentStateLabel(state: number | null | undefined): string {
  switch (state) {
    case 0: return 'accepting_entries';
    case 1: return 'in_progress';
    case 2: return 'completed';
    case 3: return 'cancelled';
    default: return 'upcoming';
  }
}

// ─── Data types ───────────────────────────────────────────────────────────────

// Kept for legacy compatibility (used by other parts of the app)
export interface DfkTournamentRaw {
  id: string;
  tournament_start_time?: number;
  entry_period_start?: number;
  rounds?: number | null;
  current_round?: number | null;
  best_of?: number | null;
  entrants?: number | null;
  entrants_claimed?: number | null;
  tournament_type?: number | null;
  tournament_state?: number | null;
  tournament_hosted?: boolean | null;
  host_address?: string | null;
  host_tier?: number | null;
  min_level?: number | null;
  max_level?: number | null;
  min_rarity?: number | null;
  all_unique_classes?: boolean | null;
  no_triple_classes?: boolean | null;
  only_pj?: boolean | null;
  only_bannermen?: boolean | null;
  party_count?: number | null;
  raw_json?: unknown;
}

export interface DfkTournamentCard {
  id: string;
  name: string;
  tournamentType: number | null;
  tournamentState: number | null; // on-chain state integer
  stateLabel: string;             // human-readable state
  tournamentStartTime: number | null;
  entryPeriodStart: number | null;
  entriesCloseInSeconds: number | null;
  entriesOpenInSeconds: number | null; // null if already open
  entrants: number | null;        // registered count (or max when in_progress)
  entrantsClaimed: number | null; // confirmed/claimed count
  maxEntrants: number;            // capacity (8 for Off-Season)
  partyCount: number | null;
  format: string;
  realm: string;
  minLevel: number | null;
  maxLevel: number | null;
  minRarity: number | null;
  allUniqueClasses: boolean;
  noTripleClasses: boolean;
  onlyPJ: boolean;
  onlyBannermen: boolean;
  gloryBout: boolean;
  rounds: number | null;
  bestOf: number | null;
  tournamentHosted: boolean;
  hostAddress: string | null;
  hostTier: number | null;
  hostedBy: string | null; // display string for hosted tournaments
  rawJson: unknown;
}

// ─── Cache ────────────────────────────────────────────────────────────────────
let _cache: { data: DfkTournamentCard[]; ts: number } | null = null;
let _inflight: Promise<DfkTournamentCard[]> | null = null;

// ─── Main fetch ───────────────────────────────────────────────────────────────
export async function fetchActiveTournaments(forceRefresh = false): Promise<DfkTournamentCard[]> {
  const now = Date.now();
  if (!forceRefresh && _cache && now - _cache.ts < CACHE_TTL_MS) {
    return _cache.data;
  }
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const provider = new ethers.JsonRpcProvider(METIS_RPC);
      const contract = new ethers.Contract(PVP_DIAMOND, TOURNAMENT_ABI, provider);

      // 1. Get all active tournament IDs
      const ids: bigint[] = await contract.getActiveTournamentIds();
      console.log(`[DfkTournamentApi] ${ids.length} active tournament IDs from chain`);

      if (ids.length === 0) {
        _cache = { data: [], ts: Date.now() };
        return [];
      }

      // 2. Batch-fetch tournament data in parallel (tournament + entry settings + host data)
      const nowSec = Math.floor(Date.now() / 1000);
      const results = await Promise.all(
        ids.map(async (bigId) => {
          const id = Number(bigId);
          try {
            const [t, e, h] = await Promise.all([
              contract.getTournament(id),
              contract.getTournamentEntrySettings(id),
              contract.getTournamentHostData(id),
            ]);

            const onChainState = Number(t.state);
            const entryPeriodStart = Number(e.entryPeriodStart);
            const tournamentStartTime = Number(t.tournamentStartTime);
            const entrantsNum = Number(t.entrants);
            const claimedNum = Number(t.entrantsClaimed);
            const tournamentType = Number(t.tournamentType);
            const isHosted = Boolean(t.tournamentHosted);

            const stateLabel = onChainStateToLabel(onChainState, entryPeriodStart, nowSec);

            // Entries close when tournament starts
            const entriesCloseInSeconds = (stateLabel === 'accepting_entries' && tournamentStartTime > nowSec)
              ? tournamentStartTime - nowSec
              : null;

            // Entries open countdown for upcoming
            const entriesOpenInSeconds = (stateLabel === 'upcoming' && entryPeriodStart > nowSec)
              ? entryPeriodStart - nowSec
              : null;

            // Max capacity: Off-Season tournaments always have 8 slots
            // When in_progress, entrants IS the total who registered (= max reached or deadline passed)
            const maxEntrants = (stateLabel === 'in_progress') ? entrantsNum : 8;

            // Tournament name
            const typeName = tournamentTypeName(tournamentType);
            const name = `${typeName} #${id}`;

            // Host display
            const hostAddress = h.hostAddress !== '0x0000000000000000000000000000000000000000' ? h.hostAddress : null;
            const hostTier = Number(h.tier);
            const hostedBy = isHosted && hostAddress
              ? `${HOST_TIER_LABELS[hostTier] ?? 'Hosted'} Host (${hostAddress.slice(0, 6)}...${hostAddress.slice(-4)})`
              : null;

            // Level range for display
            const minLevel = Number(e.minLevel) || null;
            const maxLevel = Number(e.maxLevel) || null;

            // Party format
            const partyCount = Number(e.partyCount);
            const format = partyCount === 1 ? '1v1' : partyCount === 3 ? '3v3' : partyCount === 6 ? '6v6' : '—';

            const card: DfkTournamentCard = {
              id: String(id),
              name,
              tournamentType,
              tournamentState: onChainState,
              stateLabel,
              tournamentStartTime,
              entryPeriodStart,
              entriesCloseInSeconds,
              entriesOpenInSeconds,
              entrants: entrantsNum,
              entrantsClaimed: claimedNum,
              maxEntrants,
              partyCount,
              format,
              realm: 'sd',
              minLevel,
              maxLevel,
              minRarity: Number(e.minRarity) || null,
              allUniqueClasses: Boolean(e.allUniqueClasses),
              noTripleClasses: Boolean(e.noTripleClasses),
              onlyPJ: Boolean(e.onlyPJ),
              onlyBannermen: Boolean(e.onlyBannermen),
              gloryBout: false,
              rounds: Number(t.rounds) || null,
              bestOf: Number(t.bestOf) || null,
              tournamentHosted: isHosted,
              hostAddress,
              hostTier,
              hostedBy,
              rawJson: null,
            };

            return card;
          } catch (err: any) {
            console.warn(`[DfkTournamentApi] Failed to fetch tournament ${id}:`, err.message);
            return null;
          }
        })
      );

      const cards = results.filter((c): c is DfkTournamentCard => c !== null);

      // Sort: in_progress first, then accepting_entries, then upcoming
      const stateOrder: Record<string, number> = {
        in_progress: 0,
        accepting_entries: 1,
        upcoming: 2,
        completed: 3,
        cancelled: 4,
      };
      cards.sort((a, b) => {
        const so = (stateOrder[a.stateLabel] ?? 5) - (stateOrder[b.stateLabel] ?? 5);
        if (so !== 0) return so;
        // Within same state, sort by start time ascending
        return (a.tournamentStartTime ?? 0) - (b.tournamentStartTime ?? 0);
      });

      console.log(`[DfkTournamentApi] Mapped ${cards.length} tournaments from on-chain data`);
      _cache = { data: cards, ts: Date.now() };
      return cards;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

export function clearTournamentCache(): void {
  _cache = null;
}
