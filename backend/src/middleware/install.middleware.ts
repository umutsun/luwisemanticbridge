import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export function checkInstallStatus(req: Request, res: Response, next: NextFunction) {
  // Skip install check for API routes
  if (req.path.startsWith('/api/v2/install') ||
      req.path.startsWith('/api/v2/health') ||
      req.path.startsWith('/api/v2/setup')) {
    return next();
  }

  const installFlag = path.join(process.cwd(), 'install.flag');
  const isInstalled = fs.existsSync(installFlag);

  // If not installed, redirect to install page (only for frontend requests)
  if (!isInstalled && !req.path.startsWith('/api/')) {
    // Check if this is a frontend request (not API)
    if (req.accepts('html')) {
      return res.redirect('/install');
    }
  }

  next();
}