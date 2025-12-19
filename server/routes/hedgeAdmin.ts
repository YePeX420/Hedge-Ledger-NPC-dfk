import type { Router, Request, Response } from 'express';
import { db } from '../db';
import { combatSources, entitlementTiers, entitlementRules, combatKeywords, combatClassMeta, combatSkills } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

export function registerHedgeAdminRoutes(router: Router) {
  router.get('/combat/sources', async (_req: Request, res: Response) => {
    try {
      const sources = await db.select().from(combatSources);
      res.json({ sources, count: sources.length });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error fetching sources:', error);
      res.status(500).json({ error: 'Failed to fetch sources' });
    }
  });

  router.post('/combat/sources', async (req: Request, res: Response) => {
    try {
      const { url, kind, enabled = true } = req.body;
      if (!url || !kind) {
        return res.status(400).json({ error: 'url and kind are required' });
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
      res.json({ source });
    } catch (error: any) {
      console.error('[HedgeAdmin] Error creating source:', error);
      res.status(500).json({ error: 'Failed to create source' });
    }
  });

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
