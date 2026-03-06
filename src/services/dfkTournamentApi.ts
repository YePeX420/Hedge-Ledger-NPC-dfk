// src/services/dfkTournamentApi.ts
// Fetches DFK bracket tournament data from DFK's internal API.

import { getDfkIdToken } from './dfkFirebaseAuth.js';

const DFK_TOURNAMENTS_BASE = 'https://api.defikingdoms.com/tournaments';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Canonical tournament type labels ────────────────────────────────────────
// Mapped from observed tournament_type integer values.
// Expand as new types are discovered from the raw API response.
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

// ─── State labels ─────────────────────────────────────────────────────────────
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

export interface DfkTournamentRaw {
  id: string;
  creator?: string;
  tournament_start_time?: number;
  entry_period_start?: number;
  rounds?: number | null;
  current_round?: number | null;
  remaining_bouts_in_round?: number | null;
  round_length?: number | null;
  best_of?: number | null;
  entrants?: number | null;
  entrants_claimed?: number | null;
  entry_fee?: string | null;
  entry_fee_decimals?: number | null;
  tournament_type?: number | null;
  tournament_state?: number | null;
  tournament_sponsored?: boolean | null;
  party_count?: number | null;
  min_rank?: number | null;
  max_rank?: number | null;
  min_rarity?: number | null;
  max_rarity?: number | null;
  min_level?: number | null;
  max_level?: number | null;
  min_hero_stat_score?: number | null;
  max_hero_stat_score?: number | null;
  min_team_stat_score?: number | null;
  max_team_stat_score?: number | null;
  min_hero_trait_score?: number | null;
  max_hero_trait_score?: number | null;
  min_team_trait_score?: number | null;
  max_team_trait_score?: number | null;
  all_unique_classes?: boolean | null;
  no_triple_classes?: boolean | null;
  only_pj?: boolean | null;
  only_bannermen?: boolean | null;
  excluded_classes?: string | null;
  included_class_1?: number | null;
  included_class_2?: number | null;
  included_class_3?: number | null;
  must_include_class_1?: boolean | null;
  must_include_class_2?: boolean | null;
  must_include_class_3?: boolean | null;
  shot_clock_duration?: number | null;
  banked_shot_clock_time?: number | null;
  battle_inventory?: number | null;
  battle_budget?: number | null;
  player_entries?: Array<{ entry_index: number; claimed?: boolean; raw_json?: unknown }>;
  bouts?: Array<{ tournament_id: string; bout_id: number; battle_id: string; sponsor_count?: number; raw_json?: unknown }>;
  bracket_raw?: number[] | null;
  raw_json?: unknown;
}

export interface DfkTournamentCard {
  id: string;
  name: string;
  tournamentType: number | null;
  tournamentState: number | null;
  stateLabel: string;
  tournamentStartTime: number | null; // unix seconds
  entryPeriodStart: number | null;    // unix seconds
  entriesCloseInSeconds: number | null; // null if already closed
  entrants: number | null;
  entrantsClaimed: number | null;
  partyCount: number | null;
  format: string;
  realm: string;
  minLevel: number | null;
  maxLevel: number | null;
  minRarity: number | null;
  allUniqueClasses: boolean;
  noTripleClasses: boolean;
  gloryBout: boolean;
  rounds: number | null;
  bestOf: number | null;
  rawJson: unknown;
}

function mapToCard(t: DfkTournamentRaw, realm = 'sd'): DfkTournamentCard {
  const typeName = tournamentTypeName(t.tournament_type ?? null);
  const name = `${typeName} #${t.id}`;
  const now = Math.floor(Date.now() / 1000);
  const closeAt = t.tournament_start_time ?? null;
  const entriesCloseInSeconds = closeAt != null && closeAt > now ? closeAt - now : null;

  const partyCount = t.party_count ?? null;
  const format = partyCount === 1 ? '1v1' : partyCount === 3 ? '3v3' : partyCount === 6 ? '6v6' : partyCount != null ? `${partyCount}v${partyCount}` : '?v?';

  return {
    id: t.id,
    name,
    tournamentType: t.tournament_type ?? null,
    tournamentState: t.tournament_state ?? null,
    stateLabel: tournamentStateLabel(t.tournament_state ?? null),
    tournamentStartTime: t.tournament_start_time ?? null,
    entryPeriodStart: t.entry_period_start ?? null,
    entriesCloseInSeconds,
    entrants: t.entrants ?? null,
    entrantsClaimed: t.entrants_claimed ?? null,
    partyCount,
    format,
    realm,
    minLevel: t.min_level ?? null,
    maxLevel: t.max_level ?? null,
    minRarity: t.min_rarity ?? null,
    allUniqueClasses: t.all_unique_classes ?? false,
    noTripleClasses: t.no_triple_classes ?? false,
    gloryBout: false,
    rounds: t.rounds ?? null,
    bestOf: t.best_of ?? null,
    rawJson: t,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let _cache: { data: DfkTournamentCard[]; ts: number } | null = null;
let _inflight: Promise<DfkTournamentCard[]> | null = null;

async function fetchWithAuth(url: string): Promise<Response> {
  const token = await getDfkIdToken();
  return fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(12_000),
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchActiveTournaments(forceRefresh = false): Promise<DfkTournamentCard[]> {
  const now = Date.now();

  if (!forceRefresh && _cache && now - _cache.ts < CACHE_TTL_MS) {
    return _cache.data;
  }

  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      // Try endpoints in order until one works
      const endpoints = [
        `${DFK_TOURNAMENTS_BASE}/active`,
        `${DFK_TOURNAMENTS_BASE}/upcoming`,
        DFK_TOURNAMENTS_BASE,
      ];

      let raw: DfkTournamentRaw[] = [];

      for (const url of endpoints) {
        try {
          const res = await fetchWithAuth(url);
          const text = await res.text();

          if (text === 'ERROR' || !res.ok) {
            console.warn(`[DfkTournamentApi] ${url} returned ${res.status}: ${text.slice(0, 100)}`);
            continue;
          }

          const json = JSON.parse(text);

          // Log a sample of the raw payload for schema discovery
          if (process.env.NODE_ENV !== 'production') {
            const sample = Array.isArray(json) ? json[0] : json;
            if (sample) {
              console.log('[DfkTournamentApi] Sample tournament raw fields:', Object.keys(sample));
              console.log('[DfkTournamentApi] Sample tournament data:', JSON.stringify(sample).slice(0, 600));
            }
          }

          raw = Array.isArray(json) ? json : (json.tournaments ?? json.data ?? []);
          console.log(`[DfkTournamentApi] Fetched ${raw.length} tournaments from ${url}`);
          break;
        } catch (err: any) {
          console.warn(`[DfkTournamentApi] Error fetching ${url}:`, err.message);
        }
      }

      const cards = raw.map(t => mapToCard(t, 'sd'));
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
