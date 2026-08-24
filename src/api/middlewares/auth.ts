import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'test' && req.headers['x-bypass-auth'] === 'true') {
    return next();
  }

  const rawHeader = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
  const apiKeyHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (!apiKeyHeader || !safeCompare(apiKeyHeader, env.API_KEY)) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or missing API key. Please provide valid x-api-key header.'
      }
    });
    return;
  }

  next();
}
