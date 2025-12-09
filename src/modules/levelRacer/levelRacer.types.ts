export type PoolState = "OPEN" | "FILLING" | "RACING" | "FINISHED";

export type HeroRarity = "common" | "uncommon" | "rare" | "legendary" | "mythic";

export type TokenType = "JEWEL" | "CRYSTAL" | "USDC";

export interface JoinPoolRequest {
  walletAddress: string;
  heroId: string;
  heroClassSlug: string;
  heroLevel: number;
  heroRarity: HeroRarity;
  heroXp: number;
  heroHasStone: boolean;
}

export type QuestProfession = "gardening" | "mining" | "fishing" | "foraging";

export interface ActivePool {
  id: number;
  heroClassSlug: string;
  heroClassName: string;
  profession: QuestProfession;
  level: number;
  state: PoolState;
  maxEntries: number;
  currentEntries: number;
  // USD-based pricing
  usdEntryFee: string;
  usdPrize: string;
  tokenType: TokenType;
  // Token amounts (calculated from USD)
  jewelEntryFee: number;
  jewelPrize: number;
  // Special filters
  rarityFilter: string;
  maxMutations: number | null;
  isRecurrent: boolean;
  // Tracking
  totalFeesCollected?: number;
  totalFeesCollectedUsd?: string;
  prizeAwarded?: boolean;
  createdAt: string;
  finishedAt?: string;
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
  profession: QuestProfession;
  level: number;
  state: PoolState;
  maxEntries: number;
  // USD-based pricing
  usdEntryFee: string;
  usdPrize: string;
  tokenType: TokenType;
  // Token amounts (calculated from USD)
  jewelEntryFee: number;
  jewelPrize: number;
  // Special filters
  rarityFilter: string;
  maxMutations: number | null;
  isRecurrent: boolean;
  // Tracking
  totalFeesCollected: number;
  totalFeesCollectedUsd: string;
  prizeAwarded: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  winnerEntryId?: number;
  entries: PoolEntryView[];
}

export interface UpdatePoolRequest {
  usdEntryFee?: string;
  usdPrize?: string;
  tokenType?: TokenType;
  jewelEntryFee?: number;
  jewelPrize?: number;
  maxEntries?: number;
  rarityFilter?: string;
  maxMutations?: number | null;
  isRecurrent?: boolean;
  heroClassId?: number;
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
