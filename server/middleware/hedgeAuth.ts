import type { Request, Response, NextFunction } from 'express';

export function requirePublicApiKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.HEDGE_PUBLIC_API_KEY;
  
  if (!expectedKey) {
    console.error('[HedgeAuth] HEDGE_PUBLIC_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  const providedKey = req.headers['x-hedge-api-key'] as string 
    || (req.headers['authorization']?.startsWith('Bearer ') 
        ? req.headers['authorization'].substring(7) 
        : null);
  
  if (!providedKey) {
    return res.status(401).json({ error: 'API key required', hint: 'Provide x-hedge-api-key header or Authorization: Bearer <key>' });
  }
  
  if (providedKey !== expectedKey) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
}

export function requireAdminApiKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.HEDGE_ADMIN_API_KEY;
  
  if (!expectedKey) {
    console.error('[HedgeAuth] HEDGE_ADMIN_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  const providedKey = req.headers['x-hedge-api-key'] as string 
    || (req.headers['authorization']?.startsWith('Bearer ') 
        ? req.headers['authorization'].substring(7) 
        : null);
  
  if (!providedKey) {
    return res.status(401).json({ error: 'Admin API key required', hint: 'Provide x-hedge-api-key header or Authorization: Bearer <key>' });
  }
  
  if (providedKey !== expectedKey) {
    return res.status(403).json({ error: 'Invalid admin API key' });
  }
  
  next();
}
