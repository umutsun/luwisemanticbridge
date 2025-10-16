import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

/**
 * Role-based access control middleware
 */
export const requireRole = (roles: string | string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: allowedRoles,
        current: user.role
      });
    }

    next();
  };
};

/**
 * Admin-only access
 */
export const requireAdmin = requireRole(['admin', 'superadmin']);

/**
 * Analytics access - Admin or user with analytics permission
 */
export const requireAnalyticsAccess = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Admins have full access
  if (user.role === 'admin' || user.role === 'superadmin') {
    return next();
  }

  // Users can only access their own analytics
  // Add user-specific permission checks here if needed
  next();
};

/**
 * Self-access or admin - Users can access their own data, admins can access any
 */
export const requireSelfOrAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  const targetUserId = req.params.userId || req.query.userId || req.body.userId;

  if (!user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Admins can access any user's data
  if (user.role === 'admin' || user.role === 'superadmin') {
    return next();
  }

  // Users can only access their own data
  if (targetUserId && targetUserId !== user.userId) {
    return res.status(403).json({
      error: 'Can only access own data',
      code: 'SELF_ACCESS_ONLY'
    });
  }

  next();
};