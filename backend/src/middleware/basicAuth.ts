import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config.js';

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.authUser || !config.authPass) {
    next();
    return;
  }

  // Skip health checks
  if (req.path === '/healthz' || req.path === '/readyz') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    // Do NOT send WWW-Authenticate — that triggers the browser's native dialog.
    // Return JSON 401 so the frontend login screen handles it.
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const colonIndex = credentials.indexOf(':');
  if (colonIndex === -1) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = credentials.slice(0, colonIndex);
  const pass = credentials.slice(colonIndex + 1);

  const userBuf = Buffer.from(user);
  const passBuf = Buffer.from(pass);
  const expectedUserBuf = Buffer.from(config.authUser);
  const expectedPassBuf = Buffer.from(config.authPass);

  const userMatch = userBuf.length === expectedUserBuf.length &&
    timingSafeEqual(userBuf, expectedUserBuf);
  const passMatch = passBuf.length === expectedPassBuf.length &&
    timingSafeEqual(passBuf, expectedPassBuf);

  if (userMatch && passMatch) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}
