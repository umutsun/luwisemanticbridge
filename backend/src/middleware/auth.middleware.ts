import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { SubscriptionService } from '../services/subscription.service';
import { JwtPayload } from '../types/user.types';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  subscription?: any;
}

export const authenticateToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Also check cookies if no token in header
    if (!token) {
      token = req.cookies?.token || req.cookies?.['auth-token'] || req.cookies?.['asb_token'];
    }

    if (!token) {
      console.log('[AUTH] No token found in request to:', req.path);
      return res.status(401).json({
        error: 'Access token required',
        code: 'TOKEN_MISSING'
      });
    }

    console.log('[AUTH] Verifying token for:', req.path, 'Token prefix:', token.substring(0, 20) + '...');

    const authService = new AuthService();
    const user = await authService.verifyToken(token);

    // Get user details
    const userDetails = await authService.getUserById(user.userId);
    if (!userDetails) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
    console.log('[AUTH] ✓ Token verified for user:', user.userId);
    next();
  } catch (error: any) {
    console.log('[AUTH] ✗ Token verification failed:', error.message);
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'TOKEN_INVALID'
    });
  }
};

export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
};

export const requireSubscription = (feature?: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      // Admin users bypass subscription checks
      if (req.user.role === 'admin') {
        return next();
      }

      const subscriptionService = new SubscriptionService();

      // Check if user has active subscription
      const hasAccess = feature
        ? await subscriptionService.checkUserAccess(req.user.userId, feature)
        : await subscriptionService.getUserSubscription(req.user.userId) !== null;

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Active subscription required',
          code: 'SUBSCRIPTION_REQUIRED',
          message: feature ? `Feature "${feature}" requires an active subscription` : 'This feature requires an active subscription'
        });
      }

      // Get subscription details
      const subscription = await subscriptionService.getUserSubscription(req.user.userId);
      req.subscription = subscription;

      next();
    } catch (error: any) {
      console.error('Subscription check error:', error);
      return res.status(500).json({
        error: 'Subscription check failed',
        code: 'SUBSCRIPTION_CHECK_ERROR'
      });
    }
  };
};

export const checkQueryLimits = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Admin users bypass limits
    if (req.user.role === 'admin') {
      return next();
    }

    const subscriptionService = new SubscriptionService();
    const queryCheck = await subscriptionService.canUserMakeQuery(req.user.userId);

    if (!queryCheck.canQuery) {
      return res.status(429).json({
        error: 'Query limit exceeded',
        code: 'QUERY_LIMIT_EXCEEDED',
        reason: queryCheck.reason,
        remaining: queryCheck.remaining
      });
    }

    // Add remaining queries to request for tracking
    (req as any).remainingQueries = queryCheck.remaining;
    next();
  } catch (error: any) {
    console.error('Query limit check error:', error);
    return res.status(500).json({
      error: 'Query limit check failed',
      code: 'QUERY_CHECK_ERROR'
    });
  }
};

export const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const authService = new AuthService();
      const user = await authService.verifyToken(token);
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};