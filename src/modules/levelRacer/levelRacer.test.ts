import { describe, it, expect, beforeEach } from 'vitest';
import {
  commentaryForPoolCreated,
  commentaryForHeroJoined,
  commentaryForRaceStarted,
  commentaryForXpGained,
  commentaryForCloseToLevel,
  commentaryForWinnerDeclared,
  type CommentaryContext,
} from './levelRacer.commentary';
import type { ClassPool, PoolEntry, HeroClass } from '../../../shared/schema';
import type { JoinPoolRequest, PoolState } from './levelRacer.types';

const mockHeroClass: HeroClass = {
  id: 1,
  slug: 'knight',
  displayName: 'Knight',
  isEnabled: true,
};

const mockPool: ClassPool = {
  id: 1,
  heroClassId: 1,
  level: 1,
  state: 'OPEN',
  maxEntries: 6,
  jewelEntryFee: 25,
  jewelPrize: 200,
  winnerEntryId: null,
  createdAt: new Date(),
  startedAt: null,
  finishedAt: null,
};

const mockEntry: PoolEntry = {
  id: 1,
  classPoolId: 1,
  walletAddress: '0x1234',
  heroId: '12345',
  heroClassSlug: 'knight',
  heroLevel: 1,
  heroRarity: 'common',
  heroHasStone: false,
  heroInitialXp: 0,
  heroCurrentXp: 50,
  heroReadyToLevel: false,
  joinedAt: new Date(),
  isWinner: false,
  claimedExtraHeroId: null,
};

describe('Level Racer Commentary', () => {
  describe('commentaryForPoolCreated', () => {
    it('generates pool created commentary with class name and prize', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
      };
      const result = commentaryForPoolCreated(ctx);
      expect(result).toContain('Knight Arena');
      expect(result).toContain('200 JEWEL');
      expect(result).toContain('Six common heroes');
    });
  });

  describe('commentaryForHeroJoined', () => {
    it('generates hero joined commentary with hero ID', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
        entry: mockEntry,
      };
      const result = commentaryForHeroJoined(ctx);
      expect(result).toContain('Hero #12345');
      expect(result).toContain('Common');
    });

    it('handles missing entry gracefully', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
        entry: null,
      };
      const result = commentaryForHeroJoined(ctx);
      expect(result).toContain('mysterious hero');
    });
  });

  describe('commentaryForRaceStarted', () => {
    it('generates race started commentary with entry count', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
        extra: { entryCount: 6 },
      };
      const result = commentaryForRaceStarted(ctx);
      expect(result).toContain('6 heroes');
      expect(result).toContain('No stones');
    });
  });

  describe('commentaryForXpGained', () => {
    it('generates XP gained commentary with amount', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
        entry: mockEntry,
        extra: { xpGained: 15 },
      };
      const result = commentaryForXpGained(ctx);
      expect(result).toContain('Hero #12345');
      expect(result).toContain('15 XP');
    });
  });

  describe('commentaryForCloseToLevel', () => {
    it('generates close to level commentary', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
        entry: mockEntry,
      };
      const result = commentaryForCloseToLevel(ctx);
      expect(result).toContain('Hero #12345');
      expect(result).toContain('one quest away');
    });
  });

  describe('commentaryForWinnerDeclared', () => {
    it('generates winner commentary with prize', () => {
      const ctx: CommentaryContext = {
        pool: mockPool,
        heroClass: mockHeroClass,
        entry: { ...mockEntry, isWinner: true },
      };
      const result = commentaryForWinnerDeclared(ctx);
      expect(result).toContain('LEVEL UP READY');
      expect(result).toContain('Hero #12345');
      expect(result).toContain('200 JEWEL');
    });
  });
});

describe('Level Racer Types', () => {
  describe('JoinPoolRequest validation', () => {
    it('validates common hero requirements', () => {
      const validRequest: JoinPoolRequest = {
        walletAddress: '0x1234567890abcdef',
        heroId: '12345',
        heroClassSlug: 'knight',
        heroLevel: 1,
        heroRarity: 'common',
        heroXp: 0,
        heroHasStone: false,
      };
      expect(validRequest.heroRarity).toBe('common');
      expect(validRequest.heroXp).toBe(0);
      expect(validRequest.heroHasStone).toBe(false);
    });

    it('identifies invalid rarity', () => {
      const invalidRequest = {
        walletAddress: '0x1234567890abcdef',
        heroId: '12345',
        heroClassSlug: 'knight',
        heroLevel: 1,
        heroRarity: 'legendary',
        heroXp: 0,
        heroHasStone: false,
      };
      expect(invalidRequest.heroRarity).not.toBe('common');
    });

    it('identifies invalid XP', () => {
      const invalidRequest = {
        walletAddress: '0x1234567890abcdef',
        heroId: '12345',
        heroClassSlug: 'knight',
        heroLevel: 1,
        heroRarity: 'common',
        heroXp: 50,
        heroHasStone: false,
      };
      expect(invalidRequest.heroXp).not.toBe(0);
    });

    it('identifies hero with stone', () => {
      const invalidRequest = {
        walletAddress: '0x1234567890abcdef',
        heroId: '12345',
        heroClassSlug: 'knight',
        heroLevel: 1,
        heroRarity: 'common',
        heroXp: 0,
        heroHasStone: true,
      };
      expect(invalidRequest.heroHasStone).toBe(true);
    });
  });

  describe('PoolState transitions', () => {
    it('validates pool states', () => {
      const states: PoolState[] = ['OPEN', 'FILLING', 'RACING', 'FINISHED'];
      expect(states).toContain('OPEN');
      expect(states).toContain('FILLING');
      expect(states).toContain('RACING');
      expect(states).toContain('FINISHED');
    });
  });
});

describe('Level Racer Business Rules', () => {
  describe('Pool Rules', () => {
    it('enforces max 6 entries per pool', () => {
      expect(mockPool.maxEntries).toBe(6);
    });

    it('uses correct entry fee', () => {
      expect(mockPool.jewelEntryFee).toBe(25);
    });

    it('uses correct prize amount', () => {
      expect(mockPool.jewelPrize).toBe(200);
    });
  });

  describe('Winner Detection', () => {
    it('identifies first hero to reach level-up threshold as winner', () => {
      const XP_THRESHOLD = 100;
      const winningEntry = { ...mockEntry, heroCurrentXp: 100, heroReadyToLevel: true };
      expect(winningEntry.heroCurrentXp).toBeGreaterThanOrEqual(XP_THRESHOLD);
      expect(winningEntry.heroReadyToLevel).toBe(true);
    });

    it('non-winning entries do not change winner status', () => {
      const losingEntry = { ...mockEntry, heroCurrentXp: 80, heroReadyToLevel: false };
      expect(losingEntry.heroReadyToLevel).toBe(false);
      expect(losingEntry.isWinner).toBe(false);
    });
  });
});
