import type { Router, Request, Response } from 'express';
import { db } from '../db';
import { combatSources, entitlementTiers, entitlementRules, combatKeywords, combatClassMeta, combatSkills, syncRuns, syncRunItems } from '@shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { ingestCombatCodex } from '../../src/dfk/combatCodexIngestor';

export function registerHedgeAdminRoutes(router: Router) {
  
  // ============================================================================
  // COMBAT REFRESH & STATUS ENDPOINTS
  // ============================================================================

  router.post('/combat/refresh', async (req: Request, res: Response) => {
    try {
      const discover = req.body?.discover ?? true;
      const concurrency = req.body?.concurrency ?? 3;

      console.log('[HedgeAdmin] Starting combat codex refresh...', { discover, concurrency });
      const result = await ingestCombatCodex({ discover, concurrency });
      console.log('[HedgeAdmin] Combat codex refresh complete:', result);
      res.json(result);
    } catch (e: any) {
      console.error('[HedgeAdmin] Combat refresh error:', e);
      res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
  });

  router.get('/combat/status', async (_req: Request, res: Response) => {
    try {
      const [keywordCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatKeywords);
      const [classCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatClassMeta);
      const [skillCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatSkills);

      const lastSuccessResults = await db.select({
        id: syncRuns.id,
        startedAt: syncRuns.startedAt,
        finishedAt: syncRuns.finishedAt,
      })
        .from(syncRuns)
        .where(and(eq(syncRuns.domain, 'combat_codex'), eq(syncRuns.status, 'success')))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      const currentRunningResults = await db.select({
        id: syncRuns.id,
        startedAt: syncRuns.startedAt,
      })
        .from(syncRuns)
        .where(and(eq(syncRuns.domain, 'combat_codex'), eq(syncRuns.status, 'running')))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      const classesWithSkills = await db.execute(sql`
        SELECT m.class, m.source_url, m.maturity, m.last_update_note, m.last_seen_at,
               (SELECT count(*)::int FROM combat_skills s WHERE s.class = m.class) as skills_count
        FROM combat_class_meta m
        ORDER BY m.class ASC
      `);

      res.json({
        ok: true,
        counts: {
          keywords: keywordCount?.count ?? 0,
          classes: classCount?.count ?? 0,
          skills: skillCount?.count ?? 0,
        },
        lastSuccess: lastSuccessResults[0] ?? null,
        currentRunning: currentRunningResults[0] ?? null,
        classes: classesWithSkills.rows ?? [],
      });
    } catch (e: any) {
      console.error('[HedgeAdmin] Error fetching status:', e);
      res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
  });

  // ============================================================================
  // COMBAT SOURCES ENDPOINTS
  // ============================================================================

  router.get('/combat/sources', async (_req: Request, res: Response) => {
    try {
      const sources = await db.select().from(combatSources).orderBy(combatSources.kind, combatSources.url);
      res.json({ ok: true, count: sources.length, results: sources });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error fetching sources:', error);
      res.status(500).json({ ok: false, error: 'Failed to fetch sources' });
    }
  });

  router.post('/combat/sources', async (req: Request, res: Response) => {
    try {
      const { url, kind, enabled = true } = req.body;
      if (!url || !kind) {
        return res.status(400).json({ ok: false, error: 'url and kind are required' });
      }
      const [source] = await db.insert(combatSources).values({
        url,
        kind,
        enabled,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: combatSources.url,
        set: { kind, enabled, lastSeenAt: new Date() }
      }).returning();
      res.json({ ok: true, result: source });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error creating source:', error);
      res.status(500).json({ ok: false, error: 'Failed to create source' });
    }
  });

  router.patch('/combat/sources', async (req: Request, res: Response) => {
    try {
      const url = req.body?.url;
      const enabled = req.body?.enabled;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ ok: false, error: 'Missing url' });
      }
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ ok: false, error: 'Missing enabled boolean' });
      }

      const [updated] = await db.update(combatSources)
        .set({ enabled })
        .where(eq(combatSources.url, url))
        .returning();

      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Source not found' });
      }
      res.json({ ok: true, result: updated });
    } catch (e: any) {
      console.error('[HedgeAdmin] Error updating source:', e);
      res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
  });

  // ============================================================================
  // SYNC RUNS ENDPOINTS
  // ============================================================================

  router.get('/combat/sync/runs', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));

      const runs = await db.select({
        id: syncRuns.id,
        domain: syncRuns.domain,
        startedAt: syncRuns.startedAt,
        finishedAt: syncRuns.finishedAt,
        status: syncRuns.status,
        discoveredUrls: syncRuns.discoveredUrls,
        keywordsUpserted: syncRuns.keywordsUpserted,
        classesAttempted: syncRuns.classesAttempted,
        classesIngested: syncRuns.classesIngested,
        skillsUpserted: syncRuns.skillsUpserted,
        ragDocsUpserted: syncRuns.ragDocsUpserted,
        error: syncRuns.error,
      })
        .from(syncRuns)
        .where(eq(syncRuns.domain, 'combat_codex'))
        .orderBy(desc(syncRuns.startedAt))
        .limit(limit);

      res.json({ ok: true, count: runs.length, results: runs });
    } catch (e: any) {
      console.error('[HedgeAdmin] Error fetching sync runs:', e);
      res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
  });

  router.get('/combat/sync/runs/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid id' });
      }

      const [run] = await db.select()
        .from(syncRuns)
        .where(and(eq(syncRuns.id, id), eq(syncRuns.domain, 'combat_codex')));

      if (!run) {
        return res.status(404).json({ ok: false, error: 'Run not found' });
      }

      const items = await db.select()
        .from(syncRunItems)
        .where(eq(syncRunItems.syncRunId, id))
        .orderBy(syncRunItems.id);

      res.json({ ok: true, run, items });
    } catch (e: any) {
      console.error('[HedgeAdmin] Error fetching sync run:', e);
      res.status(500).json({ ok: false, error: e?.message ?? String(e) });
    }
  });

  // ============================================================================
  // COMBAT STATS (simplified count endpoint)
  // ============================================================================

  router.get('/combat/stats', async (_req: Request, res: Response) => {
    try {
      const [keywordCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatKeywords);
      const [classCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatClassMeta);
      const [skillCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatSkills);
      const [sourceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(combatSources);
      
      res.json({
        keywords: keywordCount?.count || 0,
        classes: classCount?.count || 0,
        skills: skillCount?.count || 0,
        sources: sourceCount?.count || 0,
      });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // ============================================================================
  // ENTITLEMENT ENDPOINTS
  // ============================================================================

  router.get('/entitlements/tiers', async (_req: Request, res: Response) => {
    try {
      const tiers = await db.select().from(entitlementTiers).orderBy(entitlementTiers.sortOrder);
      res.json({ tiers, count: tiers.length });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error fetching tiers:', error);
      res.status(500).json({ error: 'Failed to fetch tiers' });
    }
  });

  router.post('/entitlements/tiers', async (req: Request, res: Response) => {
    try {
      const { tierId, displayName, description, priceMonthly, enabled = true, sortOrder } = req.body;
      if (!tierId || !displayName || sortOrder === undefined) {
        return res.status(400).json({ error: 'tierId, displayName, and sortOrder are required' });
      }
      const [tier] = await db.insert(entitlementTiers).values({
        tierId,
        displayName,
        description,
        priceMonthly: priceMonthly?.toString(),
        enabled,
        sortOrder,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: entitlementTiers.tierId,
        set: { displayName, description, priceMonthly: priceMonthly?.toString(), enabled, sortOrder, updatedAt: new Date() }
      }).returning();
      res.json({ tier });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error creating tier:', error);
      res.status(500).json({ error: 'Failed to create tier' });
    }
  });

  router.get('/entitlements/rules', async (_req: Request, res: Response) => {
    try {
      const rules = await db.select().from(entitlementRules);
      res.json({ rules, count: rules.length });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error fetching rules:', error);
      res.status(500).json({ error: 'Failed to fetch rules' });
    }
  });

  router.post('/entitlements/rules', async (req: Request, res: Response) => {
    try {
      const { domain, resource, tierId, mode, rule } = req.body;
      if (!domain || !resource || !tierId || !mode || !rule) {
        return res.status(400).json({ error: 'domain, resource, tierId, mode, and rule are required' });
      }
      const [newRule] = await db.insert(entitlementRules).values({
        domain,
        resource,
        tierId,
        mode,
        rule,
        updatedAt: new Date(),
      }).returning();
      res.json({ rule: newRule });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error creating rule:', error);
      res.status(500).json({ error: 'Failed to create rule' });
    }
  });
}
