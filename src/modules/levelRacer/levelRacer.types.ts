export type PoolState = "OPEN" | "FILLING" | "RACING" | "FINISHED";

export type HeroRarity = "common" | "uncommon" | "rare" | "legendary" | "mythic";

export interface JoinPoolRequest {
  walletAddress: string;
  heroId: string;
  heroClassSlug: string;
  heroLevel: number;
  heroRarity: HeroRarity;
  heroXp: number;
  heroHasStone: boolean;
}

export interface ActivePool {
  id: number;
  heroClassSlug: string;
  heroClassName: string;
  level: number;
  state: PoolState;
  maxEntries: number;
  currentEntries: number;
  jewelEntryFee: number;
  jewelPrize: number;
  createdAt: string;
}

export interface PoolEntryView {
  id: number;
  walletAddress: string;
  heroId: string;
  heroClassSlug: string;
  heroLevel: number;
  heroRarity: string;
  heroCurrentXp: number;
  heroReadyToLevel: boolean;
  joinedAt: string;
  isWinner: boolean;
}

export interface GetPoolResponse {
  id: number;
  heroClassSlug: string;
  heroClassName: string;
  level: number;
  state: PoolState;
  maxEntries: number;
  jewelEntryFee: number;
  jewelPrize: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  winnerEntryId?: number;
  entries: PoolEntryView[];
}

export interface RaceEventView {
  id: number;
  eventType: string;
  commentary: string;
  createdAt: string;
  heroId?: string;
  walletAddress?: string;
  payload: any;
}

export interface JoinPoolResponse {
  success: boolean;
  poolId: number;
  entryId: number;
  message: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface HeroXpUpdate {
  entryId: number;
  newXp: number;
  readyToLevel: boolean;
}

export interface XpUpdateRequest {
  updates: HeroXpUpdate[];
}

export interface XpUpdateResponse {
  success: boolean;
  message: string;
}

export type RaceEventType = 
  | "POOL_CREATED" 
  | "HERO_JOINED" 
  | "RACE_STARTED" 
  | "XP_GAINED" 
  | "CLOSE_TO_LEVEL" 
  | "WINNER_DECLARED";
