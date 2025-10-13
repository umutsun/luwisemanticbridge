import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export function checkSetupRequired(req: Request, res: Response, next: NextFunction) {
  // Skip check for API routes and static assets
  if (req.path.startsWith('/api/') ||
      req.path.startsWith('/_next/') ||
      req.path.startsWith('/favicon') ||
      req.path.endsWith('.js') ||
      req.path.endsWith('.css') ||
      req.path.endsWith('.ico')) {
    return next();
  }

  // Check if .env.lsemb exists and is configured
  const envFile = path.join(process.cwd(), '.env.lsemb');
  const setupFlag = path.join(process.cwd(), 'setup.flag');

  let needsSetup = false;

  // If setup flag exists, setup is required
  if (fs.existsSync(setupFlag)) {
    const flagContent = fs.readFileSync(setupFlag, 'utf8');
    needsSetup = flagContent.includes('SETUP_REQUIRED=true');
  }

  // Check .env.lsemb configuration
  if (!needsSetup && fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    const requiredVars = ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
    const allConfigured = requiredVars.every(var =>
      envContent.includes(`${var}=`) &&
      !envContent.includes(`${var}=your_`) &&
      !envContent.includes(`${var}=`) === false || envContent.includes(`${var}=""`) === false
    );

    needsSetup = !allConfigured;
  } else if (!fs.existsSync(envFile)) {
    needsSetup = true;
  }

  // If setup is needed and not already on setup page, redirect
  if (needsSetup && !req.path.startsWith('/setup')) {
    // For API requests, return JSON
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({
        error: 'Setup required',
        redirect: '/setup'
      });
    }

    // For frontend requests, redirect to setup
    return res.redirect('/setup');
  }

  next();
}