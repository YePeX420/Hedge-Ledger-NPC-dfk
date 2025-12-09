import { db } from "../../../server/db.js";
import { eq, and, ne, asc, sql, count } from "drizzle-orm";
import {
  heroClasses,
  classPools,
  poolEntries,
  raceEvents,
  QUEST_PROFESSIONS,
  type ClassPool,
  type PoolEntry,
  type HeroClass,
  type QuestProfession,
} from "../../../shared/schema.js";
import { generateCommentary, type CommentaryContext } from "./levelRacer.commentary";
import type {
  PoolState,
  JoinPoolRequest,
  ActivePool,
  PoolEntryView,
  GetPoolResponse,
  RaceEventView,
  HeroXpUpdate,
  RaceEventType,
  TokenType,
  UpdatePoolRequest,
} from "./levelRacer.types";

// DEV/TEST: Placeholder thresholds for simulation. Real implementation uses blockchain readyToLevel flag.
const XP_THRESHOLD_TO_LEVEL = 100;
const CLOSE_TO_LEVEL_THRESHOLD = 80;

export async function getHeroClassBySlug(slug: string): Promise<HeroClass | undefined> {
  const [heroClass] = await db
    .select()
    .from(heroClasses)
    .where(eq(heroClasses.slug, slug))
    .limit(1);
  return heroClass;
}

export async function getAllHeroClasses(): Promise<HeroClass[]> {
  return db.select().from(heroClasses).where(eq(heroClasses.isEnabled, true));
}

export async function getBasicHeroClasses(): Promise<HeroClass[]> {
  return db.select().from(heroClasses).where(
    and(eq(heroClasses.isEnabled, true), eq(heroClasses.isBasic, true))
  );
}

export async function getActivePools(): Promise<ActivePool[]> {
  const pools = await db
    .select({
      pool: classPools,
      heroClass: heroClasses,
      entryCount: sql<number>`(SELECT COUNT(*) FROM pool_entries WHERE pool_entries.class_pool_id = ${classPools.id})`,
    })
    .from(classPools)
    .innerJoin(heroClasses, eq(classPools.heroClassId, heroClasses.id))
    .where(ne(classPools.state, "FINISHED"));

  return pools.map((row) => ({
    id: row.pool.id,
    heroClassSlug: row.heroClass.slug,
    heroClassName: row.heroClass.displayName,
    profession: row.pool.profession as QuestProfession,
    level: row.pool.level,
    state: row.pool.state as PoolState,
    maxEntries: row.pool.maxEntries,
    currentEntries: Number(row.entryCount),
    usdEntryFee: row.pool.usdEntryFee,
    usdPrize: row.pool.usdPrize,
    tokenType: row.pool.tokenType as TokenType,
    jewelEntryFee: row.pool.jewelEntryFee,
    jewelPrize: row.pool.jewelPrize,
    rarityFilter: row.pool.rarityFilter,
    maxMutations: row.pool.maxMutations,
    isRecurrent: row.pool.isRecurrent,
    createdAt: row.pool.createdAt.toISOString(),
  }));
}

export async function getAllPools(): Promise<ActivePool[]> {
  const pools = await db
    .select({
      pool: classPools,
      heroClass: heroClasses,
      entryCount: sql<number>`(SELECT COUNT(*) FROM pool_entries WHERE pool_entries.class_pool_id = ${classPools.id})`,
    })
    .from(classPools)
    .innerJoin(heroClasses, eq(classPools.heroClassId, heroClasses.id))
    .orderBy(sql`${classPools.createdAt} DESC`);

  return pools.map((row) => ({
    id: row.pool.id,
    heroClassSlug: row.heroClass.slug,
    heroClassName: row.heroClass.displayName,
    profession: row.pool.profession as QuestProfession,
    level: row.pool.level,
    state: row.pool.state as PoolState,
    maxEntries: row.pool.maxEntries,
    currentEntries: Number(row.entryCount),
    usdEntryFee: row.pool.usdEntryFee,
    usdPrize: row.pool.usdPrize,
    tokenType: row.pool.tokenType as TokenType,
    jewelEntryFee: row.pool.jewelEntryFee,
    jewelPrize: row.pool.jewelPrize,
    rarityFilter: row.pool.rarityFilter,
    maxMutations: row.pool.maxMutations,
    isRecurrent: row.pool.isRecurrent,
    totalFeesCollected: row.pool.totalFeesCollected,
    totalFeesCollectedUsd: row.pool.totalFeesCollectedUsd,
    prizeAwarded: row.pool.prizeAwarded,
    createdAt: row.pool.createdAt.toISOString(),
    finishedAt: row.pool.finishedAt?.toISOString(),
  }));
}

export async function adminCreatePool(classSlug: string, options?: {
  profession?: QuestProfession;
  level?: number;
  maxEntries?: number;
  usdEntryFee?: string;
  usdPrize?: string;
  tokenType?: TokenType;
  jewelEntryFee?: number;
  jewelPrize?: number;
  rarityFilter?: string;
  maxMutations?: number | null;
  isRecurrent?: boolean;
}): Promise<ClassPool> {
  const heroClass = await getHeroClassBySlug(classSlug);
  if (!heroClass) throw new Error(`Hero class '${classSlug}' not found`);
  
  if (!heroClass.isBasic) {
    throw new Error(`${heroClass.displayName} is an advanced class. Only basic classes can have pools.`);
  }

  const profession = options?.profession ?? "gardening";
  const existingPool = await getActivePoolForClass(heroClass.id, profession);
  if (existingPool) {
    throw new Error(`An active ${profession} pool already exists for ${heroClass.displayName}`);
  }

  const [pool] = await db
    .insert(classPools)
    .values({
      heroClassId: heroClass.id,
      profession,
      level: options?.level ?? 1,
      state: "OPEN",
      maxEntries: options?.maxEntries ?? 6,
      usdEntryFee: options?.usdEntryFee ?? "5.00",
      usdPrize: options?.usdPrize ?? "40.00",
      tokenType: options?.tokenType ?? "JEWEL",
      jewelEntryFee: options?.jewelEntryFee ?? 25,
      jewelPrize: options?.jewelPrize ?? 200,
      rarityFilter: options?.rarityFilter ?? "common",
      maxMutations: options?.maxMutations ?? null,
      isRecurrent: options?.isRecurrent ?? true,
    })
    .returning();

  await emitRaceEvent(pool.id, null, "POOL_CREATED", { heroClassId: heroClass.id, profession }, pool, heroClass);

  return pool;
}

export async function adminUpdatePool(poolId: number, updates: UpdatePoolRequest): Promise<ClassPool> {
  const [existingPool] = await db.select().from(classPools).where(eq(classPools.id, poolId)).limit(1);
  if (!existingPool) throw new Error("Pool not found");
  
  if (existingPool.state !== "OPEN") {
    throw new Error("Can only edit pools in OPEN state");
  }

  const updateData: Partial<typeof classPools.$inferInsert> = {};
  
  if (updates.usdEntryFee !== undefined) updateData.usdEntryFee = updates.usdEntryFee;
  if (updates.usdPrize !== undefined) updateData.usdPrize = updates.usdPrize;
  if (updates.jewelEntryFee !== undefined) updateData.jewelEntryFee = updates.jewelEntryFee;
  if (updates.jewelPrize !== undefined) updateData.jewelPrize = updates.jewelPrize;
  if (updates.tokenType !== undefined) updateData.tokenType = updates.tokenType;
  if (updates.maxEntries !== undefined) updateData.maxEntries = updates.maxEntries;
  if (updates.rarityFilter !== undefined) updateData.rarityFilter = updates.rarityFilter;
  if (updates.maxMutations !== undefined) updateData.maxMutations = updates.maxMutations;
  if (updates.isRecurrent !== undefined) updateData.isRecurrent = updates.isRecurrent;
  if (updates.heroClassId !== undefined) updateData.heroClassId = updates.heroClassId;

  const [updatedPool] = await db
    .update(classPools)
    .set(updateData)
    .where(eq(classPools.id, poolId))
    .returning();

  return updatedPool;
}

export async function getActivePoolForClass(heroClassId: number, profession?: QuestProfession): Promise<ClassPool | undefined> {
  const conditions = [
    eq(classPools.heroClassId, heroClassId),
    ne(classPools.state, "FINISHED")
  ];
  
  if (profession) {
    conditions.push(eq(classPools.profession, profession));
  }
  
  const [pool] = await db
    .select()
    .from(classPools)
    .where(and(...conditions))
    .limit(1);
  return pool;
}

export async function createPoolForClass(heroClassId: number, profession: QuestProfession = "gardening"): Promise<ClassPool> {
  const [heroClass] = await db.select().from(heroClasses).where(eq(heroClasses.id, heroClassId)).limit(1);
  if (!heroClass) throw new Error("Hero class not found");

  const [pool] = await db
    .insert(classPools)
    .values({
      heroClassId,
      profession,
      level: 1,
      state: "OPEN",
      maxEntries: 6,
      usdEntryFee: "5.00",
      usdPrize: "40.00",
      tokenType: "JEWEL",
      jewelEntryFee: 25,
      jewelPrize: 200,
      rarityFilter: "common",
      maxMutations: null,
      isRecurrent: true,
    })
    .returning();

  await emitRaceEvent(pool.id, null, "POOL_CREATED", { heroClassId, profession }, pool, heroClass);

  return pool;
}

export async function getOrCreatePoolForClass(classSlug: string): Promise<{ pool: ClassPool; heroClass: HeroClass }> {
  const heroClass = await getHeroClassBySlug(classSlug);
  if (!heroClass) throw new Error(`Hero class '${classSlug}' not found`);

  let pool = await getActivePoolForClass(heroClass.id);
  if (!pool) {
    pool = await createPoolForClass(heroClass.id);
  }

  return { pool, heroClass };
}

export async function getPoolEntryCount(poolId: number): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(poolEntries)
    .where(eq(poolEntries.classPoolId, poolId));
  return result?.count || 0;
}

export async function joinPool(
  request: JoinPoolRequest
): Promise<{ success: boolean; poolId: number; entryId: number; message: string }> {
  const { pool, heroClass } = await getOrCreatePoolForClass(request.heroClassSlug);

  if (pool.state === "FINISHED") {
    throw new Error("Pool is finished. A new pool will be created for the next race.");
  }

  if (pool.state === "RACING") {
    throw new Error("Race has already started. Wait for the next pool.");
  }

  const entryCount = await getPoolEntryCount(pool.id);
  if (entryCount >= pool.maxEntries) {
    throw new Error("Pool is full.");
  }

  if (request.heroRarity !== "common") {
    throw new Error("Only common heroes can enter this arena.");
  }

  if (request.heroXp !== 0) {
    throw new Error("Hero must have 0 XP to enter.");
  }

  if (request.heroHasStone) {
    throw new Error("Heroes with leveling stones cannot enter.");
  }

  if (request.heroLevel !== pool.level) {
    throw new Error(`Hero must be level ${pool.level} to enter this pool.`);
  }

  const [entry] = await db
    .insert(poolEntries)
    .values({
      classPoolId: pool.id,
      walletAddress: request.walletAddress.toLowerCase(),
      heroId: request.heroId,
      heroClassSlug: request.heroClassSlug,
      heroLevel: request.heroLevel,
      heroRarity: request.heroRarity,
      heroHasStone: request.heroHasStone,
      heroInitialXp: request.heroXp,
      heroCurrentXp: request.heroXp,
      heroReadyToLevel: false,
      isWinner: false,
    })
    .returning();

  // Track entry fee collection
  await db
    .update(classPools)
    .set({ totalFeesCollected: sql`${classPools.totalFeesCollected} + ${pool.jewelEntryFee}` })
    .where(eq(classPools.id, pool.id));

  await emitRaceEvent(pool.id, entry.id, "HERO_JOINED", { heroId: request.heroId }, pool, heroClass, entry);

  const newCount = entryCount + 1;
  let updatedState = pool.state;

  if (newCount > 1 && pool.state === "OPEN") {
    await db.update(classPools).set({ state: "FILLING" }).where(eq(classPools.id, pool.id));
    updatedState = "FILLING";
  }

  if (newCount >= pool.maxEntries) {
    const [updatedPool] = await db
      .update(classPools)
      .set({ state: "RACING", startedAt: new Date() })
      .where(eq(classPools.id, pool.id))
      .returning();

    await emitRaceEvent(pool.id, null, "RACE_STARTED", { entryCount: newCount }, updatedPool, heroClass);
  }

  return {
    success: true,
    poolId: pool.id,
    entryId: entry.id,
    message: `Hero #${request.heroId} has joined the ${heroClass.displayName} Arena!`,
  };
}

export async function getPoolDetails(poolId: number): Promise<GetPoolResponse | null> {
  const [poolData] = await db
    .select({
      pool: classPools,
      heroClass: heroClasses,
    })
    .from(classPools)
    .innerJoin(heroClasses, eq(classPools.heroClassId, heroClasses.id))
    .where(eq(classPools.id, poolId));

  if (!poolData) return null;

  const entries = await db
    .select()
    .from(poolEntries)
    .where(eq(poolEntries.classPoolId, poolId))
    .orderBy(asc(poolEntries.joinedAt));

  const entryViews: PoolEntryView[] = entries.map((e) => ({
    id: e.id,
    walletAddress: e.walletAddress,
    heroId: e.heroId,
    heroClassSlug: e.heroClassSlug,
    heroLevel: e.heroLevel,
    heroRarity: e.heroRarity,
    heroCurrentXp: e.heroCurrentXp,
    heroReadyToLevel: e.heroReadyToLevel,
    joinedAt: e.joinedAt.toISOString(),
    isWinner: e.isWinner,
  }));

  return {
    id: poolData.pool.id,
    heroClassSlug: poolData.heroClass.slug,
    heroClassName: poolData.heroClass.displayName,
    profession: poolData.pool.profession as QuestProfession,
    level: poolData.pool.level,
    state: poolData.pool.state as PoolState,
    maxEntries: poolData.pool.maxEntries,
    usdEntryFee: poolData.pool.usdEntryFee,
    usdPrize: poolData.pool.usdPrize,
    tokenType: poolData.pool.tokenType as TokenType,
    jewelEntryFee: poolData.pool.jewelEntryFee,
    jewelPrize: poolData.pool.jewelPrize,
    rarityFilter: poolData.pool.rarityFilter,
    maxMutations: poolData.pool.maxMutations,
    isRecurrent: poolData.pool.isRecurrent,
    totalFeesCollected: poolData.pool.totalFeesCollected,
    totalFeesCollectedUsd: poolData.pool.totalFeesCollectedUsd,
    prizeAwarded: poolData.pool.prizeAwarded,
    createdAt: poolData.pool.createdAt.toISOString(),
    startedAt: poolData.pool.startedAt?.toISOString(),
    finishedAt: poolData.pool.finishedAt?.toISOString(),
    winnerEntryId: poolData.pool.winnerEntryId || undefined,
    entries: entryViews,
  };
}

export async function getPoolEvents(poolId: number): Promise<RaceEventView[]> {
  const events = await db
    .select()
    .from(raceEvents)
    .where(eq(raceEvents.classPoolId, poolId))
    .orderBy(asc(raceEvents.createdAt));

  return events.map((e) => {
    const payload = e.payload as Record<string, any> | null;
    return {
      id: e.id,
      eventType: e.eventType,
      commentary: e.commentary,
      createdAt: e.createdAt.toISOString(),
      heroId: payload?.heroId,
      walletAddress: payload?.walletAddress,
      payload: payload,
    };
  });
}

export async function processXpUpdates(
  poolId: number,
  updates: HeroXpUpdate[]
): Promise<{ success: boolean; message: string }> {
  const [poolData] = await db
    .select({
      pool: classPools,
      heroClass: heroClasses,
    })
    .from(classPools)
    .innerJoin(heroClasses, eq(classPools.heroClassId, heroClasses.id))
    .where(eq(classPools.id, poolId));

  if (!poolData) {
    throw new Error("Pool not found");
  }

  if (poolData.pool.state !== "RACING") {
    throw new Error("Pool is not in RACING state");
  }

  let winnerDeclared = false;

  for (const update of updates) {
    const [entry] = await db
      .select()
      .from(poolEntries)
      .where(eq(poolEntries.id, update.entryId))
      .limit(1);

    if (!entry || entry.classPoolId !== poolId) continue;

    const wasReadyBefore = entry.heroReadyToLevel;
    const previousXp = entry.heroCurrentXp;
    const xpGained = update.newXp - previousXp;

    await db
      .update(poolEntries)
      .set({
        heroCurrentXp: update.newXp,
        heroReadyToLevel: update.readyToLevel,
      })
      .where(eq(poolEntries.id, update.entryId));

    const [updatedEntry] = await db.select().from(poolEntries).where(eq(poolEntries.id, update.entryId));

    if (xpGained > 0 && !update.readyToLevel) {
      await emitRaceEvent(
        poolId,
        entry.id,
        "XP_GAINED",
        { heroId: entry.heroId, xpGained, newXp: update.newXp },
        poolData.pool,
        poolData.heroClass,
        updatedEntry
      );

      if (update.newXp >= CLOSE_TO_LEVEL_THRESHOLD && previousXp < CLOSE_TO_LEVEL_THRESHOLD) {
        await emitRaceEvent(
          poolId,
          entry.id,
          "CLOSE_TO_LEVEL",
          { heroId: entry.heroId, currentXp: update.newXp },
          poolData.pool,
          poolData.heroClass,
          updatedEntry
        );
      }
    }

    if (!wasReadyBefore && update.readyToLevel && !poolData.pool.winnerEntryId) {
      await db
        .update(poolEntries)
        .set({ isWinner: true })
        .where(eq(poolEntries.id, update.entryId));

      // Set winner, mark prize as awarded
      const [finishedPool] = await db
        .update(classPools)
        .set({
          state: "FINISHED",
          finishedAt: new Date(),
          winnerEntryId: update.entryId,
          prizeAwarded: true,
        })
        .where(eq(classPools.id, poolId))
        .returning();

      const [winnerEntry] = await db.select().from(poolEntries).where(eq(poolEntries.id, update.entryId));

      await emitRaceEvent(
        poolId,
        update.entryId,
        "WINNER_DECLARED",
        { heroId: entry.heroId, walletAddress: entry.walletAddress },
        finishedPool,
        poolData.heroClass,
        winnerEntry
      );

      // Auto-create next pool if this one is recurrent
      if (finishedPool.isRecurrent) {
        try {
          await autoCreateNextPool(finishedPool, poolData.heroClass);
        } catch (err) {
          console.error(`[LevelRacer] Failed to auto-create next pool for ${poolData.heroClass.displayName}:`, err);
          // Retry once after a short delay
          setTimeout(async () => {
            try {
              await autoCreateNextPool(finishedPool, poolData.heroClass);
            } catch (retryErr) {
              console.error(`[LevelRacer] Retry failed for ${poolData.heroClass.displayName}:`, retryErr);
            }
          }, 1000);
        }
      }

      winnerDeclared = true;
      break;
    }
  }

  return {
    success: true,
    message: winnerDeclared ? "Race completed! Winner declared." : "XP updates processed.",
  };
}

/**
 * DEV/TEST ONLY: Simulates XP gains for testing purposes.
 * 
 * In production, XP updates come from blockchain indexer monitoring actual
 * quest completions. The winner is determined by whoever's `readyToLevel` 
 * flag becomes true first (from the blockchain), NOT a fixed XP threshold.
 * 
 * This simulation uses XP_THRESHOLD_TO_LEVEL as a placeholder to trigger
 * the readyToLevel condition for testing the race flow.
 */
export async function simulateTick(poolId: number): Promise<{ success: boolean; message: string }> {
  const [poolData] = await db
    .select({
      pool: classPools,
      heroClass: heroClasses,
    })
    .from(classPools)
    .innerJoin(heroClasses, eq(classPools.heroClassId, heroClasses.id))
    .where(eq(classPools.id, poolId));

  if (!poolData) {
    throw new Error("Pool not found");
  }

  if (poolData.pool.state !== "RACING") {
    throw new Error("Pool is not in RACING state. Cannot simulate.");
  }

  const entries = await db
    .select()
    .from(poolEntries)
    .where(eq(poolEntries.classPoolId, poolId));

  const updates: HeroXpUpdate[] = [];

  for (const entry of entries) {
    if (entry.heroReadyToLevel) continue;

    const xpGain = Math.floor(Math.random() * 20) + 5;
    const newXp = entry.heroCurrentXp + xpGain;
    // In production: readyToLevel comes from blockchain hero data, not XP threshold
    const readyToLevel = newXp >= XP_THRESHOLD_TO_LEVEL;

    updates.push({
      entryId: entry.id,
      newXp: Math.min(newXp, XP_THRESHOLD_TO_LEVEL),
      readyToLevel,
    });
  }

  if (updates.length === 0) {
    return { success: true, message: "No updates to process (all heroes ready to level)." };
  }

  return processXpUpdates(poolId, updates);
}

/**
 * Auto-create next pool when a recurrent pool finishes.
 * Copies all settings from the finished pool (fees, token type, rarity filter, etc.)
 */
async function autoCreateNextPool(finishedPool: ClassPool, heroClass: HeroClass): Promise<ClassPool> {
  const [newPool] = await db
    .insert(classPools)
    .values({
      heroClassId: finishedPool.heroClassId,
      level: finishedPool.level,
      state: "OPEN",
      maxEntries: finishedPool.maxEntries,
      usdEntryFee: finishedPool.usdEntryFee,
      usdPrize: finishedPool.usdPrize,
      tokenType: finishedPool.tokenType,
      jewelEntryFee: finishedPool.jewelEntryFee,
      jewelPrize: finishedPool.jewelPrize,
      rarityFilter: finishedPool.rarityFilter,
      maxMutations: finishedPool.maxMutations,
      isRecurrent: finishedPool.isRecurrent,
    })
    .returning();

  await emitRaceEvent(newPool.id, null, "POOL_CREATED", { 
    heroClassId: heroClass.id,
    autoCreated: true,
    previousPoolId: finishedPool.id
  }, newPool, heroClass);

  console.log(`[LevelRacer] Auto-created new pool #${newPool.id} for ${heroClass.displayName} (previous: #${finishedPool.id})`);

  return newPool;
}

async function emitRaceEvent(
  poolId: number,
  entryId: number | null,
  eventType: RaceEventType,
  payload: Record<string, any>,
  pool: ClassPool,
  heroClass: HeroClass,
  entry?: PoolEntry
): Promise<void> {
  const ctx: CommentaryContext = {
    pool,
    heroClass,
    entry: entry || null,
    extra: payload,
  };

  const commentary = generateCommentary(eventType, ctx);

  await db.insert(raceEvents).values({
    classPoolId: poolId,
    poolEntryId: entryId,
    eventType,
    payload,
    commentary,
  });
}

/**
 * Ensures each enabled basic hero class has exactly one open pool per profession.
 * Called on startup to maintain pool availability.
 * Creates 10 basic classes × 4 professions = 40 pools total.
 */
export async function ensurePoolsForAllClasses(): Promise<void> {
  const basicClasses = await getBasicHeroClasses();
  
  for (const heroClass of basicClasses) {
    for (const profession of QUEST_PROFESSIONS) {
      const existingPool = await getActivePoolForClass(heroClass.id, profession);
      if (!existingPool) {
        // Create default pool for this class/profession combo
        const [newPool] = await db
          .insert(classPools)
          .values({
            heroClassId: heroClass.id,
            profession,
            level: 1,
            state: "OPEN",
            maxEntries: 6,
            usdEntryFee: "5.00",
            usdPrize: "40.00",
            tokenType: "JEWEL",
            jewelEntryFee: 25,
            jewelPrize: 200,
            rarityFilter: "common",
            maxMutations: null,
            isRecurrent: true,
          })
          .returning();
        
        await emitRaceEvent(newPool.id, null, "POOL_CREATED", { 
          heroClassId: heroClass.id,
          profession,
          autoCreated: true,
          reason: "startup_initialization"
        }, newPool, heroClass);
        
        console.log(`[LevelRacer] Created startup pool #${newPool.id} for ${heroClass.displayName} (${profession})`);
      }
    }
  }
}

export async function seedHeroClasses(): Promise<void> {
  const existingClasses = await db.select().from(heroClasses);
  if (existingClasses.length > 0) return;

  const defaultClasses = [
    { slug: "knight", displayName: "Knight" },
    { slug: "warrior", displayName: "Warrior" },
    { slug: "wizard", displayName: "Wizard" },
    { slug: "thief", displayName: "Thief" },
    { slug: "archer", displayName: "Archer" },
    { slug: "priest", displayName: "Priest" },
    { slug: "monk", displayName: "Monk" },
    { slug: "pirate", displayName: "Pirate" },
    { slug: "berserker", displayName: "Berserker" },
    { slug: "seer", displayName: "Seer" },
    { slug: "paladin", displayName: "Paladin" },
    { slug: "darkKnight", displayName: "Dark Knight" },
    { slug: "summoner", displayName: "Summoner" },
    { slug: "ninja", displayName: "Ninja" },
    { slug: "shapeshifter", displayName: "Shapeshifter" },
    { slug: "dragoon", displayName: "Dragoon" },
    { slug: "sage", displayName: "Sage" },
    { slug: "dreadKnight", displayName: "Dread Knight" },
  ];

  await db.insert(heroClasses).values(defaultClasses.map((c) => ({ ...c, isEnabled: true })));
  console.log("[LevelRacer] Seeded hero classes");
}
