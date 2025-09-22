'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Shield,
  Users,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  CheckCircle,
  XCircle,
  Key,
  Lock,
  Unlock,
  Copy,
  Save
} from 'lucide-react';

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
  category: 'user' | 'system' | 'data' | 'workflow' | 'security' | 'admin';
}

interface UserRole {
  userId: string;
  userName: string;
  userEmail: string;
  roleName: string;
  assignedAt: string;
  assignedBy: string;
}

export default function RBACManager() {
  const [roles, setRoles] = useState<Role[]>([
    {
      id: '1',
      name: 'admin',
      description: 'Full system access',
      permissions: ['*'],
      userCount: 2,
      isSystem: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    },
    {
      id: '2',
      name: 'operator',
      description: 'System operator with limited admin access',
      permissions: [
        'users:read',
        'users:update',
        'workflows:read',
        'workflows:execute',
        'data:read',
        'data:write',
        'system:monitor'
      ],
      userCount: 5,
      isSystem: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    },
    {
      id: '3',
      name: 'analyst',
      description: 'Data analyst with read-only access',
      permissions: [
        'data:read',
        'reports:read',
        'analytics:read',
        'query:execute'
      ],
      userCount: 8,
      isSystem: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    },
    {
      id: '4',
      name: 'user',
      description: 'Regular user with basic access',
      permissions: [
        'query:execute',
        'documents:read',
        'documents:write',
        'profile:read',
        'profile:update'
      ],
      userCount: 25,
      isSystem: true,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }
  ]);

  const [permissions, setPermissions] = useState<Permission[]>([
    { id: '1', name: 'Create Users', resource: 'users', action: 'create', description: 'Create new user accounts', category: 'user' },
    { id: '2', name: 'Read Users', resource: 'users', action: 'read', description: 'View user information', category: 'user' },
    { id: '3', name: 'Update Users', resource: 'users', action: 'update', description: 'Modify user accounts', category: 'user' },
    { id: '4', name: 'Delete Users', resource: 'users', action: 'delete', description: 'Remove user accounts', category: 'user' },
    { id: '5', name: 'Manage Roles', resource: 'roles', action: 'manage', description: 'Create and modify roles', category: 'admin' },
    { id: '6', name: 'Read Workflows', resource: 'workflows', action: 'read', description: 'View workflows', category: 'workflow' },
    { id: '7', name: 'Execute Workflows', resource: 'workflows', action: 'execute', description: 'Run workflows', category: 'workflow' },
    { id: '8', name: 'Read Data', resource: 'data', action: 'read', description: 'Access system data', category: 'data' },
    { id: '9', name: 'Write Data', resource: 'data', action: 'write', description: 'Modify system data', category: 'data' },
    { id: '10', name: 'System Monitor', resource: 'system', action: 'monitor', description: 'View system metrics', category: 'system' },
    { id: '11', name: 'System Configure', resource: 'system', action: 'configure', description: 'Modify system settings', category: 'system' },
    { id: '12', name: 'Security Audit', resource: 'security', action: 'audit', description: 'Access security logs', category: 'security' }
  ]);

  const [userRoles, setUserRoles] = useState<UserRole[]>([
    { userId: '1', userName: 'admin', userEmail: 'admin@example.com', roleName: 'admin', assignedAt: '2024-01-01', assignedBy: 'system' },
    { userId: '2', userName: 'operator1', userEmail: 'operator1@example.com', roleName: 'operator', assignedAt: '2024-01-02', assignedBy: 'admin' },
    { userId: '3', userName: 'analyst1', userEmail: 'analyst1@example.com', roleName: 'analyst', assignedAt: '2024-01-03', assignedBy: 'admin' }
  ]);

  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    permissions: [] as string[]
  });

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleCreateRole = () => {
    if (newRole.name && newRole.description) {
      const role: Role = {
        id: (roles.length + 1).toString(),
        name: newRole.name,
        description: newRole.description,
        permissions: newRole.permissions,
        userCount: 0,
        isSystem: false,
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0]
      };
      setRoles([...roles, role]);
      setNewRole({ name: '', description: '', permissions: [] });
      setIsCreateDialogOpen(false);
    }
  };

  const handleUpdateRole = (roleId: string, updates: Partial<Role>) => {
    setRoles(roles.map(role =>
      role.id === roleId
        ? { ...role, ...updates, updatedAt: new Date().toISOString().split('T')[0] }
        : role
    ));
  };

  const handleDeleteRole = (roleId: string) => {
    if (confirm('Are you sure you want to delete this role?')) {
      setRoles(roles.filter(role => role.id !== roleId));
    }
  };

  const handleTogglePermission = (permissionId: string, checked: boolean) => {
    if (editingRole) {
      const permissions = checked
        ? [...editingRole.permissions, permissionId]
        : editingRole.permissions.filter(p => p !== permissionId);
      setEditingRole({ ...editingRole, permissions });
    } else if (isCreateDialogOpen) {
      const permissions = checked
        ? [...newRole.permissions, permissionId]
        : newRole.permissions.filter(p => p !== permissionId);
      setNewRole({ ...newRole, permissions });
    }
  };

  const duplicateRole = (role: Role) => {
    const duplicate: Role = {
      ...role,
      id: (roles.length + 1).toString(),
      name: `${role.name}_copy`,
      userCount: 0,
      isSystem: false,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };
    setRoles([...roles, duplicate]);
  };

  const getPermissionById = (id: string) => {
    return permissions.find(p => p.id === id);
  };

  const getPermissionsByCategory = (category: string) => {
    return permissions.filter(p => p.category === category);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role & Access Control</h1>
          <p className="text-muted-foreground">
            Manage user roles and permissions
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
              <DialogDescription>
                Define a new role with specific permissions
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role Name</Label>
                  <Input
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    placeholder="e.g., content_manager"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={newRole.description}
                    onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                    placeholder="Brief description of the role"
                  />
                </div>
              </div>

              <div>
                <Label>Permissions</Label>
                <Tabs defaultValue="all" className="mt-2">
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="user">User</TabsTrigger>
                    <TabsTrigger value="system">System</TabsTrigger>
                    <TabsTrigger value="data">Data</TabsTrigger>
                    <TabsTrigger value="workflow">Workflow</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="space-y-4">
                    {permissions.map((permission) => (
                      <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-0.5">
                          <div className="font-medium">{permission.name}</div>
                          <div className="text-sm text-muted-foreground">{permission.description}</div>
                        </div>
                        <Switch
                          checked={newRole.permissions.includes(permission.id)}
                          onCheckedChange={(checked) => handleTogglePermission(permission.id, checked)}
                        />
                      </div>
                    ))}
                  </TabsContent>

                  {['user', 'system', 'data', 'workflow', 'security'].map(category => (
                    <TabsContent key={category} value={category} className="space-y-4">
                      {getPermissionsByCategory(category).map((permission) => (
                        <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="space-y-0.5">
                            <div className="font-medium">{permission.name}</div>
                            <div className="text-sm text-muted-foreground">{permission.description}</div>
                          </div>
                          <Switch
                            checked={newRole.permissions.includes(permission.id)}
                            onCheckedChange={(checked) => handleTogglePermission(permission.id, checked)}
                          />
                        </div>
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateRole}>Create Role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="roles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="assignments">User Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid gap-4">
            {roles.map((role) => (
              <Card key={role.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{role.name}</CardTitle>
                        <Badge variant={role.isSystem ? 'secondary' : 'default'}>
                          {role.isSystem ? 'System' : 'Custom'}
                        </Badge>
                      </div>
                      <CardDescription>{role.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        <Users className="h-3 w-3 mr-1" />
                        {role.userCount} users
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => setEditingRole(role)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateRole(role)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          {!role.isSystem && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteRole(role.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Permissions</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {role.permissions.includes('*') ? (
                          <Badge variant="destructive">
                            <Key className="h-3 w-3 mr-1" />
                            Full Access
                          </Badge>
                        ) : (
                          role.permissions.map((permissionId) => {
                            const permission = getPermissionById(permissionId);
                            return permission ? (
                              <Badge key={permissionId} variant="outline">
                                {permission.name}
                              </Badge>
                            ) : null;
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Permissions</CardTitle>
              <CardDescription>
                System permissions that can be assigned to roles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Permission</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium">{permission.name}</TableCell>
                      <TableCell>{permission.resource}</TableCell>
                      <TableCell>{permission.action}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {permission.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{permission.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Role Assignments</CardTitle>
              <CardDescription>
                View and manage role assignments for users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Assigned At</TableHead>
                    <TableHead>Assigned By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userRoles.map((userRole) => (
                    <TableRow key={userRole.userId}>
                      <TableCell className="font-medium">{userRole.userName}</TableCell>
                      <TableCell>{userRole.userEmail}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{userRole.roleName}</Badge>
                      </TableCell>
                      <TableCell>{new Date(userRole.assignedAt).toLocaleDateString()}</TableCell>
                      <TableCell>{userRole.assignedBy}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              <XCircle className="h-4 w-4 mr-2" />
                              Remove Role
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Role Dialog */}
      {editingRole && (
        <Dialog open={!!editingRole} onOpenChange={() => setEditingRole(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Role: {editingRole.name}</DialogTitle>
              <DialogDescription>
                Modify role permissions and settings
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role Name</Label>
                  <Input
                    value={editingRole.name}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                    disabled={editingRole.isSystem}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={editingRole.description}
                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              <div>
                <Label>Permissions</Label>
                <Tabs defaultValue="all" className="mt-2">
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="user">User</TabsTrigger>
                    <TabsTrigger value="system">System</TabsTrigger>
                    <TabsTrigger value="data">Data</TabsTrigger>
                    <TabsTrigger value="workflow">Workflow</TabsTrigger>
                    <TabsTrigger value="security">Security</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="space-y-4">
                    {permissions.map((permission) => (
                      <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-0.5">
                          <div className="font-medium">{permission.name}</div>
                          <div className="text-sm text-muted-foreground">{permission.description}</div>
                        </div>
                        <Switch
                          checked={editingRole.permissions.includes('*') || editingRole.permissions.includes(permission.id)}
                          onCheckedChange={(checked) => handleTogglePermission(permission.id, checked)}
                          disabled={editingRole.permissions.includes('*')}
                        />
                      </div>
                    ))}
                  </TabsContent>

                  {['user', 'system', 'data', 'workflow', 'security'].map(category => (
                    <TabsContent key={category} value={category} className="space-y-4">
                      {getPermissionsByCategory(category).map((permission) => (
                        <div key={permission.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="space-y-0.5">
                            <div className="font-medium">{permission.name}</div>
                            <div className="text-sm text-muted-foreground">{permission.description}</div>
                          </div>
                          <Switch
                            checked={editingRole.permissions.includes('*') || editingRole.permissions.includes(permission.id)}
                            onCheckedChange={(checked) => handleTogglePermission(permission.id, checked)}
                            disabled={editingRole.permissions.includes('*')}
                          />
                        </div>
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  handleUpdateRole(editingRole.id, {
                    name: editingRole.name,
                    description: editingRole.description,
                    permissions: editingRole.permissions
                  });
                  setEditingRole(null);
                }}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}