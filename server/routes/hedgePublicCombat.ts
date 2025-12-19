import { Router, Request, Response } from 'express';
import { db } from '../db';
import { combatKeywords, combatClassMeta, combatSkills, syncRuns } from '@shared/schema';
import { eq, ilike, and, desc, sql } from 'drizzle-orm';
import { getEntitlements, shapeObjectByAllowlist } from '../../src/entitlements/entitlements';
import { resolveTier } from '../../src/entitlements/tierResolver';

export const publicCombatRouter = Router();

publicCombatRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const kwResult = await db.select({ count: sql<number>`count(*)::int` }).from(combatKeywords);
    const clResult = await db.select({ count: sql<number>`count(*)::int` }).from(combatClassMeta);
    const skResult = await db.select({ count: sql<number>`count(*)::int` }).from(combatSkills);
    
    const lastSuccessResult = await db
      .select({
        id: syncRuns.id,
        startedAt: syncRuns.startedAt,
        finishedAt: syncRuns.finishedAt,
      })
      .from(syncRuns)
      .where(and(eq(syncRuns.domain, 'combat_codex'), eq(syncRuns.status, 'success')))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);

    res.json({
      ok: true,
      keywords: kwResult[0]?.count ?? 0,
      classes: clResult[0]?.count ?? 0,
      skills: skResult[0]?.count ?? 0,
      lastSuccess: lastSuccessResult[0] ?? null,
    });
  } catch (e: any) {
    console.error('[PublicCombat] Error in /status:', e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

publicCombatRouter.get('/classes', async (_req: Request, res: Response) => {
  try {
    const classes = await db
      .select({
        class: combatClassMeta.class,
        sourceUrl: combatClassMeta.sourceUrl,
        maturity: combatClassMeta.maturity,
        lastUpdateNote: combatClassMeta.lastUpdateNote,
        disciplines: combatClassMeta.disciplines,
        summary: combatClassMeta.summary,
        lastSeenAt: combatClassMeta.lastSeenAt,
      })
      .from(combatClassMeta)
      .orderBy(combatClassMeta.class);

    const classesWithCount = await Promise.all(
      classes.map(async (c) => {
        const countResult = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(combatSkills)
          .where(eq(combatSkills.class, c.class));
        return {
          ...c,
          skills_count: countResult[0]?.count ?? 0,
        };
      })
    );

    res.json({ ok: true, count: classesWithCount.length, results: classesWithCount });
  } catch (e: any) {
    console.error('[PublicCombat] Error in /classes:', e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

publicCombatRouter.get('/keywords', async (_req: Request, res: Response) => {
  try {
    const keywords = await db
      .select({
        keyword: combatKeywords.keyword,
        definition: combatKeywords.definition,
        sourceUrl: combatKeywords.sourceUrl,
        lastSeenAt: combatKeywords.lastSeenAt,
      })
      .from(combatKeywords)
      .orderBy(combatKeywords.keyword);

    res.json({ ok: true, count: keywords.length, results: keywords });
  } catch (e: any) {
    console.error('[PublicCombat] Error in /keywords:', e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

publicCombatRouter.get('/skills/search', async (req: Request, res: Response) => {
  try {
    const tier = resolveTier(req);
    const ent = await getEntitlements('combat', 'skills.search', tier);

    const className = typeof req.query.class === 'string' ? req.query.class : undefined;
    const tierNum = typeof req.query.tier === 'string' ? Number(req.query.tier) : undefined;
    const discipline = typeof req.query.discipline === 'string' ? req.query.discipline : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

    const tagParam = req.query.tag;
    const tags: string[] =
      typeof tagParam === 'string'
        ? [tagParam]
        : Array.isArray(tagParam)
          ? (tagParam.filter((t) => typeof t === 'string') as string[])
          : [];

    const tagSearchEnabled = ent.flags['combat.skills.searchByTags'] ?? true;
    if (tags.length && !tagSearchEnabled) {
      return res.status(403).json({ ok: false, error: 'Tag search is not available for this tier.' });
    }

    const conditions: any[] = [];

    if (className) {
      conditions.push(eq(combatSkills.class, className));
    }
    if (Number.isFinite(tierNum)) {
      conditions.push(eq(combatSkills.tier, tierNum!));
    }
    if (discipline) {
      conditions.push(eq(combatSkills.discipline, discipline));
    }
    if (q) {
      conditions.push(
        sql`(${combatSkills.ability} ilike ${`%${q}%`} or coalesce(${combatSkills.descriptionRaw},'') ilike ${`%${q}%`})`
      );
    }
    if (tags.length) {
      const lowerTags = tags.map((t) => t.toLowerCase().replace(/[^a-z0-9_-]/gi, ''));
      if (lowerTags.some(t => !t)) {
        return res.status(400).json({ ok: false, error: 'Invalid tag format.' });
      }
      const tagsArray = `{${lowerTags.join(',')}}`;
      conditions.push(sql`${combatSkills.tags} && ${tagsArray}::text[]`);
    }

    const baseQuery = db
      .select()
      .from(combatSkills)
      .orderBy(combatSkills.class, combatSkills.tier, combatSkills.skillPoints, combatSkills.ability)
      .limit(200);

    let rows;
    if (conditions.length > 0) {
      rows = await baseQuery.where(and(...conditions));
    } else {
      rows = await baseQuery;
    }

    const shaped = rows.map((r: any) => {
      const base: Record<string, unknown> = {
        class: r.class,
        tier: r.tier,
        skill_points: r.skillPoints,
        discipline: r.discipline,
        ability: r.ability,
        description_raw: r.descriptionRaw,
        range: r.range,
        mana_cost: r.manaCost,
        mana_growth: r.manaGrowth,
        dod: r.dod,
        tags: r.tags,
        source_url: r.sourceUrl,
        last_seen_at: r.lastSeenAt,
        summary: r.descriptionRaw ? String(r.descriptionRaw).slice(0, 120) : null,
      };
      
      if (ent.flags['combat.codexScore.enabled']) {
        base.codex_score = null;
        base.synergy_notes = null;
        base.recommended_roles = null;
      }
      
      return shapeObjectByAllowlist(base, ent.allowFields);
    });

    res.json({
      ok: true,
      tier,
      features: ent.flags,
      count: shaped.length,
      results: shaped,
    });
  } catch (e: any) {
    console.error('[PublicCombat] Error in /skills/search:', e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});
