import type { ClassPool, PoolEntry, HeroClass } from "../../../shared/schema";

export interface CommentaryContext {
  pool: ClassPool;
  heroClass: HeroClass;
  entry?: PoolEntry | null;
  extra?: Record<string, any>;
}

export function commentaryForPoolCreated(ctx: CommentaryContext): string {
  const className = ctx.heroClass.displayName;
  return `Welcome to the ${className} Arena. Six common heroes will enter. One walks out with ${ctx.pool.jewelPrize} JEWEL.`;
}

export function commentaryForHeroJoined(ctx: CommentaryContext): string {
  if (!ctx.entry) return "A mysterious hero has entered the arena.";
  const heroId = ctx.entry.heroId;
  return `Hero #${heroId} steps into the arena. Just a Common… but maybe today's their day.`;
}

export function commentaryForRaceStarted(ctx: CommentaryContext): string {
  const entryCount = ctx.extra?.entryCount || 6;
  return `The gates are open. ${entryCount} heroes begin their race to level up. No stones. No excuses.`;
}

export function commentaryForXpGained(ctx: CommentaryContext): string {
  if (!ctx.entry) return "A hero gains experience.";
  const heroId = ctx.entry.heroId;
  const xpGained = ctx.extra?.xpGained || 0;
  return `Hero #${heroId} gains ${xpGained} XP. Slowly, the gap begins to form.`;
}

export function commentaryForCloseToLevel(ctx: CommentaryContext): string {
  if (!ctx.entry) return "A hero is close to leveling up.";
  const heroId = ctx.entry.heroId;
  return `Hero #${heroId} is one quest away from leveling. The tension is delicious.`;
}

export function commentaryForWinnerDeclared(ctx: CommentaryContext): string {
  if (!ctx.entry) return "We have a winner!";
  const heroId = ctx.entry.heroId;
  const prize = ctx.pool.jewelPrize;
  return `LEVEL UP READY! Hero #${heroId} wins the arena – and picks a loser's hero to steal, plus ${prize} JEWEL. Brutal. Perfect.`;
}

export function generateCommentary(
  eventType: string,
  ctx: CommentaryContext
): string {
  switch (eventType) {
    case "POOL_CREATED":
      return commentaryForPoolCreated(ctx);
    case "HERO_JOINED":
      return commentaryForHeroJoined(ctx);
    case "RACE_STARTED":
      return commentaryForRaceStarted(ctx);
    case "XP_GAINED":
      return commentaryForXpGained(ctx);
    case "CLOSE_TO_LEVEL":
      return commentaryForCloseToLevel(ctx);
    case "WINNER_DECLARED":
      return commentaryForWinnerDeclared(ctx);
    default:
      return "Something happened in the arena.";
  }
}
