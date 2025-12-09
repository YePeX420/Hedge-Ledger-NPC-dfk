/**
 * DFK Challenge Leagues – Shared API Contract
 * --------------------------------------------
 * This file defines ALL type shapes shared between:
 *
 *  - Backend (DFK API service)
 *  - Frontend (Dashboard / Web client)
 *
 * Purpose:
 * - Ensure frontend and backend always agree on returned JSON shapes.
 * - Standardize signup flows, tier logic, smurf detection feedback,
 *   and season metadata.
 *
 * DO NOT place business logic here — only TypeScript types & documentation.
 *
 * Both repos must import these definitions when interacting with
 * League APIs (signup, status, active seasons).
 */

/* ---------------------------------------------------------
 *  TIER SYSTEM
 * --------------------------------------------------------- */

/**
 * League tier codes.
 *
 * These mirror DFK rarity tiers:
 *  - COMMON
 *  - UNCOMMON
 *  - RARE
 *  - LEGENDARY
 *  - MYTHIC
 *
 * A player will be locked into exactly one tier per season.
 */
export type TierCode =
  | "COMMON"
  | "UNCOMMON"
  | "RARE"
  | "LEGENDARY"
  | "MYTHIC";

/* ---------------------------------------------------------
 *  SMURF DETECTION
 * --------------------------------------------------------- */

/**
 * Actions taken when smurf detection flags a rule:
 * - NONE: No penalty
 * - ESCALATE_TIER: Moved into a higher tier (fairness enforcement)
 * - DISQUALIFY: Removed from competition for this season
 * - FLAG_REVIEW: Logged but no change yet (admins may inspect)
 */
export type SmurfAction =
  | "NONE"
  | "ESCALATE_TIER"
  | "DISQUALIFY"
  | "FLAG_REVIEW";

/**
 * A single triggered smurf detection rule.
 * Returned to frontend so player sees exactly WHY a decision was made.
 */
export interface SmurfIncidentDTO {
  id?: number; // Optional: DB ID for audit logs

  ruleKey: string;         // Unique key of the rule e.g. "INBOUND_POWER_SPIKE"
  severity: "INFO" | "WARN" | "CRITICAL";
  actionTaken: SmurfAction;   // What the system decided based on this rule

  /**
   * Human-readable explanation.
   * Example:
   *  "Significant inbound hero or token transfers during signup freeze window."
   */
  reason: string;

  /**
   * Optional metadata — can include hero IDs transferred,
   * power score deltas, time windows, tx hashes, etc.
   */
  details?: any;

  createdAt?: string; // ISO timestamp
}

/* ---------------------------------------------------------
 *  USER STATUS WITHIN A SEASON
 * --------------------------------------------------------- */

/**
 * Backend returns the user's enrollment status inside each season summary.
 * If user hasn't signed up yet, `enrolled = false`.
 */
export interface LeagueUserStatus {
  enrolled: boolean;

  /**
   * Locked tier assigned by backend after:
   *  - base tier computation
   *  - smurf detection pass
   */
  lockedTierCode?: TierCode;

  /**
   * Whether the user has been disqualified from this season.
   */
  disqualified: boolean;
  disqualificationReason?: string | null;

  /**
   * Entry fee payment status:
   *  - PENDING: User still needs to pay 10 JEWEL
   *  - PAID: Entry fee successfully detected on-chain
   *  - FAILED: Wrong amount / wrong wallet / expired
   *  - NOT_REQUIRED: Internal/invite-only events
   */
  paymentStatus?: "PENDING" | "PAID" | "FAILED" | "NOT_REQUIRED";
}

/* ---------------------------------------------------------
 *  SEASON OVERVIEW (for GET /api/leagues/active)
 * --------------------------------------------------------- */

/**
 * High-level summary of a league season.
 */
export interface LeagueSeasonSummary {
  id: number;              // DB ID of the season
  key: string;             // "2026-08" etc.
  name: string;            // Human-readable ("August 2026 League")

  startsAt: string;        // ISO timestamp
  endsAt: string;          // ISO timestamp

  signupOpensAt: string;   // ISO timestamp
  signupClosesAt: string;  // ISO timestamp

  isSignupOpen: boolean;   // Computed server-side

  /**
   * Present ONLY if user is logged in (auth middleware).
   * undefined if not authenticated.
   */
  userStatus?: LeagueUserStatus;
}

/* ---------------------------------------------------------
 *  SIGNUP RESPONSE
 * --------------------------------------------------------- */

/**
 * Response returned by POST /api/leagues/:seasonId/signup
 * and GET /api/leagues/:seasonId/signup-status
 *
 * IMPORTANT:
 *  Frontend should rely on this structure for:
 *   - showing tier
 *   - payment instructions
 *   - smurf rule explanations
 *   - blocking disqualified users
 */
export interface LeagueSignupResponse {
  /* Who + where */
  seasonId: number;
  userId: string;           // Discord user ID (or internal auth ID)
  clusterKey: string;       // Unique identifier grouping all of user's wallets
  walletAddress: string;    // Wallet used for signup

  /* Base tier BEFORE smurf adjustments */
  baseTierCode: TierCode;

  /* Final tier AFTER smurf adjustments */
  lockedTierCode: TierCode;

  /* Whether this tier is upward-only (cannot downgrade) */
  upwardOnly: boolean;

  /* Whether smurf detection modified the player's tier */
  tierAdjusted: boolean;

  /* Type of adjustment:
   *  - NONE
   *  - ESCALATED
   *  - DISQUALIFIED
   */
  adjustmentType: "NONE" | "ESCALATED" | "DISQUALIFIED";

  /**
   * If adjusted or disqualified, backend provides a friendly explanation.
   * Examples:
   *  "Inbound hero transfer detected during freeze window."
   *  "Cluster contains a MYTHIC wallet; moving you to Mythic League."
   */
  adjustmentReason?: string;

  /* If disqualified entirely */
  disqualified: boolean;
  disqualificationReason?: string | null;

  /* Entry fee information (always 10 JEWEL for now) */
  entryFee: {
    amount: string;         // "10"
    token: string;          // "JEWEL"
    chain: string;          // "DFKCHAIN"
    payToAddress: string;   // Hedge treasury or smart contract
  };

  /* Payment status for the entry fee */
  paymentStatus: "PENDING" | "PAID" | "FAILED";

  /**
   * FULL list of triggered smurf detection rules.
   * Frontend MUST show all incidents to user for transparency.
   */
  smurfIncidents: SmurfIncidentDTO[];

  /* Version of the disclaimer shown to user during signup */
  disclaimerVersion: string;

  /**
   * A human-readable message for the UI.
   * Examples:
   *  - "Welcome to the Rare League! Good luck this season."
   *  - "You have been escalated to the Legendary League for fair competition."
   *  - "You were disqualified due to anti-smurfing rules."
   */
  message: string;
}

/* ---------------------------------------------------------
 *  API REQUEST TYPES
 * --------------------------------------------------------- */

/**
 * Body sent from frontend → backend when signing up for a season.
 *
 * WalletAddress must be validated by backend and belong to the clusterKey.
 */
export interface LeagueSignupRequest {
  walletAddress: string;
  acceptTerms: boolean;   // User must accept the anti-smurf disclaimer
}

/* ---------------------------------------------------------
 *  WRAPPERS FOR LIST ENDPOINTS
 * --------------------------------------------------------- */

/**
 * Response for GET /api/leagues/active
 */
export interface ActiveLeaguesResponse {
  seasons: LeagueSeasonSummary[];
}

/**
 * Response for GET /api/leagues/:seasonId/signup-status
 * Same shape as LeagueSignupResponse, but does NOT change anything.
 */
export type LeagueSignupStatusResponse = LeagueSignupResponse;

/* ---------------------------------------------------------
 * END OF CONTRACT
 * --------------------------------------------------------- */
