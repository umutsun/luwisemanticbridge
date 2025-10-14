'use client';

import React from 'react';
import { useSession } from 'next-auth/react';

interface Permission {
  resource: string;
  action: string;
}

interface AccessControlProps {
  permissions: string[] | Permission[];
  roles?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface HasAccessProps {
  permissions?: string[] | Permission[];
  roles?: string[];
  children: (hasAccess: boolean) => React.ReactNode;
}

// Convert permission object to string format
export function permissionToString(permission: Permission): string {
  return `${permission.resource}:${permission.action}`;
}

// Check if user has required permissions
function hasPermission(
  userPermissions: string[],
  requiredPermissions: string[] | Permission[]
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  // Convert all required permissions to strings
  const requiredPermissionStrings = requiredPermissions.map(p =>
    typeof p === 'string' ? p : permissionToString(p)
  );

  // Check for wildcard permission
  if (userPermissions.includes('*')) {
    return true;
  }

  // Check each required permission
  return requiredPermissionStrings.every(required =>
    userPermissions.some(userPermission => {
      if (userPermission === '*') return true;

      // Handle wildcard resources (e.g., 'data:*' means all data actions)
      if (userPermission.endsWith(':*')) {
        const resource = userPermission.split(':')[0];
        return requiredPermissionStrings.some(p => p.startsWith(`${resource}:`));
      }

      return userPermission === required;
    })
  );
}

// Check if user has required role
function hasRole(userRoles: string[], requiredRoles: string[]): boolean {
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }
  return requiredRoles.some(role => userRoles.includes(role));
}

// Access Control Component - renders children or fallback
export function AccessControl({
  permissions,
  roles,
  fallback = null,
  children
}: AccessControlProps) {
  const { data: session } = useSession();

  if (!session) {
    return <>{fallback}</>;
  }

  const userPermissions = session.user.permissions || [];
  const userRoles = [session.user.role || 'user']; // Add main role to roles array

  const permissionCheck = hasPermission(userPermissions, permissions);
  const roleCheck = hasRole(userRoles, roles || []);

  if (permissionCheck && roleCheck) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

// Has Access Component - renders function with access boolean
export function HasAccess({
  permissions,
  roles,
  children
}: HasAccessProps) {
  const { data: session } = useSession();

  if (!session) {
    return children(false);
  }

  const userPermissions = session.user.permissions || [];
  const userRoles = [session.user.role || 'user'];

  const permissionCheck = hasPermission(userPermissions, permissions || []);
  const roleCheck = hasRole(userRoles, roles || []);

  return children(permissionCheck && roleCheck);
}

// Hook for checking access
export function useAccess() {
  const { data: session } = useSession();

  const checkAccess = React.useCallback((
    permissions?: string[] | Permission[],
    roles?: string[]
  ): boolean => {
    if (!session) {
      return false;
    }

    const userPermissions = session.user.permissions || [];
    const userRoles = [session.user.role || 'user'];

    const permissionCheck = hasPermission(userPermissions, permissions || []);
    const roleCheck = hasRole(userRoles, roles || []);

    return permissionCheck && roleCheck;
  }, [session]);

  return { checkAccess, session };
}

// Higher-order component for protecting routes
export function withAccessControl<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: {
    permissions?: string[] | Permission[];
    roles?: string[];
    redirectTo?: string;
  } = {}
) {
  return function WithAccessControl(props: P) {
    const { checkAccess } = useAccess();
    const router = useRouter();

    React.useEffect(() => {
      if (!checkAccess(options.permissions, options.roles)) {
        router.push(options.redirectTo || '/unauthorized');
      }
    }, [checkAccess, router, options]);

    const hasAccess = checkAccess(options.permissions, options.roles);

    if (!hasAccess) {
      return null; // or loading spinner
    }

    return <WrappedComponent {...props} />;
  };
}

// Permission Gate Component - shows/hides based on single permission
export function PermissionGate({
  permission,
  fallback = null,
  children
}: {
  permission: string | Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AccessControl permissions={[permission]} fallback={fallback}>
      {children}
    </AccessControl>
  );
}

// Role Gate Component - shows/hides based on single role
export function RoleGate({
  role,
  fallback = null,
  children
}: {
  role: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <AccessControl roles={[role]} fallback={fallback}>
      {children}
    </AccessControl>
  );
}

// Common permission constants
export const PERMISSIONS = {
  // User permissions
  USER_CREATE: 'users:create',
  USER_READ: 'users:read',
  USER_UPDATE: 'users:update',
  USER_DELETE: 'users:delete',

  // Role permissions
  ROLE_MANAGE: 'roles:manage',
  ROLE_READ: 'roles:read',

  // System permissions
  SYSTEM_MONITOR: 'system:monitor',
  SYSTEM_CONFIGURE: 'system:configure',
  SYSTEM_ADMIN: 'system:*',

  // Data permissions
  DATA_READ: 'data:read',
  DATA_WRITE: 'data:write',
  DATA_DELETE: 'data:delete',
  DATA_EXPORT: 'data:export',

  // Workflow permissions
  WORKFLOW_READ: 'workflows:read',
  WORKFLOW_EXECUTE: 'workflows:execute',
  WORKFLOW_CREATE: 'workflows:create',
  WORKFLOW_UPDATE: 'workflows:update',
  WORKFLOW_DELETE: 'workflows:delete',

  // Document permissions
  DOCUMENT_READ: 'documents:read',
  DOCUMENT_WRITE: 'documents:write',
  DOCUMENT_DELETE: 'documents:delete',

  // Security permissions
  SECURITY_AUDIT: 'security:audit',
  SECURITY_MANAGE: 'security:manage',

  // Admin permissions
  ADMIN_FULL: '*'
} as const;

// Common role constants
export const ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  ANALYST: 'analyst',
  USER: 'user'
} as const;

export default AccessControl;