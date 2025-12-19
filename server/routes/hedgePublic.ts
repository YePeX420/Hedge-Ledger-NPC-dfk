import type { Router, Request, Response } from 'express';
import { db } from '../db';
import { combatKeywords, combatClassMeta, combatSkills } from '@shared/schema';
import { eq, ilike } from 'drizzle-orm';

export function registerHedgePublicRoutes(router: Router) {
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      await db.execute('SELECT 1');
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: 'error', message: 'Database unavailable' });
    }
  });

  router.get('/combat/keywords', async (req: Request, res: Response) => {
    try {
      const search = req.query.q as string | undefined;
      let results;
      if (search) {
        results = await db.select().from(combatKeywords).where(ilike(combatKeywords.keyword, `%${search}%`));
      } else {
        results = await db.select().from(combatKeywords);
      }
      res.json({ keywords: results, count: results.length });
    } catch (error: any) {
      console.error('[HedgePublic] Error fetching keywords:', error);
      res.status(500).json({ error: 'Failed to fetch keywords' });
    }
  });

  router.get('/combat/classes', async (_req: Request, res: Response) => {
    try {
      const classes = await db.select().from(combatClassMeta);
      res.json({ classes, count: classes.length });
    } catch (error: any) {
      console.error('[HedgePublic] Error fetching classes:', error);
      res.status(500).json({ error: 'Failed to fetch classes' });
    }
  });

  router.get('/combat/classes/:className', async (req: Request, res: Response) => {
    try {
      const className = req.params.className;
      const [classMeta] = await db.select().from(combatClassMeta).where(eq(combatClassMeta.class, className));
      if (!classMeta) {
        return res.status(404).json({ error: 'Class not found' });
      }
      const skills = await db.select().from(combatSkills).where(eq(combatSkills.class, className));
      res.json({ class: classMeta, skills, skillCount: skills.length });
    } catch (error: any) {
      console.error('[HedgePublic] Error fetching class:', error);
      res.status(500).json({ error: 'Failed to fetch class' });
    }
  });

  router.get('/combat/skills', async (req: Request, res: Response) => {
    try {
      const className = req.query.class as string | undefined;
      const tier = req.query.tier as string | undefined;
      
      let query = db.select().from(combatSkills);
      
      if (className) {
        query = query.where(eq(combatSkills.class, className)) as typeof query;
      }
      if (tier) {
        const tierNum = parseInt(tier);
        if (!isNaN(tierNum)) {
          query = query.where(eq(combatSkills.tier, tierNum)) as typeof query;
        }
      }
      
      const skills = await query;
      res.json({ skills, count: skills.length });
    } catch (error: any) {
      console.error('[HedgePublic] Error fetching skills:', error);
      res.status(500).json({ error: 'Failed to fetch skills' });
    }
  });
}
