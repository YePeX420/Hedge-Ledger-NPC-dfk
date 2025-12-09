/**
 * League Signup API Type Contracts
 * 
 * Type definitions for the Smurf Detection + League Signup API.
 * Use these types on both backend and frontend for type safety.
 */

// ============================================================================
// SHARED ENUMS & TYPES
// ============================================================================

export type LeagueStatus = 'UPCOMING' | 'REGISTRATION' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type LeagueTierCode = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'LEGENDARY';

export type TierCode = 'COMMON' | 'UNCOMMON' | 'RARE' | 'LEGENDARY' | 'MYTHIC';

export type SignupStatus = 'PENDING' | 'CONFIRMED' | 'DISQUALIFIED' | 'WITHDRAWN';

export type SmurfAction = 'NONE' | 'ESCALATE_TIER' | 'DISQUALIFY' | 'FLAG_REVIEW';

export type SmurfSeverity = 'INFO' | 'WARN' | 'CRITICAL';

// ============================================================================
// TIER MAPPING (TierCode <-> LeagueTierCode)
// ============================================================================

export const TIER_CODE_TO_LEAGUE: Record<TierCode, LeagueTierCode> = {
  COMMON: 'BRONZE',
  UNCOMMON: 'SILVER',
  RARE: 'GOLD',
  LEGENDARY: 'PLATINUM',
  MYTHIC: 'LEGENDARY',
};

export const LEAGUE_TO_TIER_CODE: Record<LeagueTierCode, TierCode> = {
  BRONZE: 'COMMON',
  SILVER: 'UNCOMMON',
  GOLD: 'RARE',
  PLATINUM: 'LEGENDARY',
  DIAMOND: 'LEGENDARY',
  LEGENDARY: 'MYTHIC',
};

// ============================================================================
// ENTRY FEE
// ============================================================================

export interface EntryFee {
  amount: string;
  token: string;
  payToAddress: string;
}

// ============================================================================
// SMURF DETECTION
// ============================================================================

export interface SmurfIncidentDTO {
  id?: number;
  ruleKey: string;
  severity: SmurfSeverity;
  actionTaken: SmurfAction;
  reason: string;
  details?: Record<string, any>;
  createdAt?: string;
}

export interface SmurfCheckResult {
  finalAction: SmurfAction;
  incidents: SmurfIncidentDTO[];
  adjustedTierCode?: LeagueTierCode;
  disqualified?: boolean;
  disqualificationReason?: string;
}

// ============================================================================
// GET /api/leagues/active
// ============================================================================

export interface LeagueSeasonDTO {
  id: number;
  name: string;
  description: string | null;
  status: LeagueStatus;
  registrationStart: string | null;
  registrationEnd: string | null;
  seasonStart: string | null;
  seasonEnd: string | null;
  entryFee: EntryFee | null;
  config: Record<string, any> | null;
}

export interface GetActiveLeaguesResponse {
  seasons: LeagueSeasonDTO[];
}

// ============================================================================
// POST /api/leagues/:seasonId/signup
// ============================================================================

export interface LeagueSignupRequest {
  userId: string;
  walletAddress: string;
}

export interface LeagueSignupSuccessResponse {
  success: true;
  signupId: number;
  baseTierCode: LeagueTierCode;
  lockedTierCode: LeagueTierCode;
  tierAdjusted: boolean;
  disqualified: false;
  smurfIncidents: SmurfIncidentDTO[];
  entryFee: EntryFee | null;
}

export interface LeagueSignupDisqualifiedResponse {
  success: false;
  disqualified: true;
  disqualificationReason: string;
  smurfIncidents: SmurfIncidentDTO[];
}

export interface LeagueSignupErrorResponse {
  error: string;
  signup?: {
    id: number;
    status: SignupStatus;
  };
}

export type LeagueSignupResponse = 
  | LeagueSignupSuccessResponse 
  | LeagueSignupDisqualifiedResponse 
  | LeagueSignupErrorResponse;

// ============================================================================
// GET /api/leagues/:seasonId/signup-status
// ============================================================================

export interface SignupStatusNotRegistered {
  registered: false;
  seasonId: number;
  userId: string;
}

export interface SignupStatusRegistered {
  registered: true;
  signupId: number;
  seasonId: number;
  userId: string;
  walletAddress: string;
  baseTierCode: LeagueTierCode;
  lockedTierCode: LeagueTierCode;
  tierAdjusted: boolean;
  disqualified: boolean;
  disqualificationReason?: string;
  status: SignupStatus;
  signedUpAt: string;
  smurfIncidents: SmurfIncidentDTO[];
}

export type GetSignupStatusResponse = SignupStatusNotRegistered | SignupStatusRegistered;

// ============================================================================
// UTILITY TYPE GUARDS
// ============================================================================

export function isSignupSuccess(response: LeagueSignupResponse): response is LeagueSignupSuccessResponse {
  return 'success' in response && response.success === true;
}

export function isSignupDisqualified(response: LeagueSignupResponse): response is LeagueSignupDisqualifiedResponse {
  return 'disqualified' in response && response.disqualified === true;
}

export function isRegistered(response: GetSignupStatusResponse): response is SignupStatusRegistered {
  return response.registered === true;
}
