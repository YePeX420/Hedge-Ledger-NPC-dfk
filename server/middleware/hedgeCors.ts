import type { Request, Response, NextFunction } from 'express';

export function hedgeCors(req: Request, res: Response, next: NextFunction) {
  const allowedOriginsEnv = process.env.HEDGE_ALLOWED_ORIGINS || '';
  const origin = req.headers.origin || '';
  
  if (!allowedOriginsEnv) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-hedge-api-key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
}
