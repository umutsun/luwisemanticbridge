'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Server,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Activity
} from 'lucide-react';
import { useSSH } from '@/hooks/useDevOps';

interface ServerConfig {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  ssh_key_id?: string;
  status: 'online' | 'offline' | 'unknown';
  os_info?: string;
  last_check?: string;
  tenants: string[];
}

interface SSHKey {
  id: string;
  name: string;
  fingerprint: string;
}

export default function ServerManager() {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [sshKeys, setSSHKeys] = useState<SSHKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null);
  const [testingServer, setTestingServer] = useState<string | null>(null);

  const { testConnection, loading: sshLoading, error: sshError } = useSSH();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    port: 22,
    username: 'root',
    ssh_key_id: '',
    tenants: [] as string[]
  });

  useEffect(() => {
    loadServers();
    loadSSHKeys();
  }, []);

  const loadServers = async () => {
    setLoading(true);
    try {
      // In a real implementation, this would fetch from the database
      // For now, we'll use localStorage as a placeholder
      const stored = localStorage.getItem('devops_servers');
      if (stored) {
        setServers(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSSHKeys = async () => {
    try {
      const stored = localStorage.getItem('devops_ssh_keys');
      if (stored) {
        setSSHKeys(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load SSH keys:', error);
    }
  };

  const saveServers = (newServers: ServerConfig[]) => {
    localStorage.setItem('devops_servers', JSON.stringify(newServers));
    setServers(newServers);
  };

  const handleAddServer = () => {
    const newServer: ServerConfig = {
      id: `server_${Date.now()}`,
      name: formData.name,
      hostname: formData.hostname,
      port: formData.port,
      username: formData.username,
      ssh_key_id: formData.ssh_key_id || undefined,
      status: 'unknown',
      tenants: formData.tenants
    };

    saveServers([...servers, newServer]);
    setShowAddDialog(false);
    resetForm();
  };

  const handleUpdateServer = () => {
    if (!editingServer) return;

    const updated = servers.map(s =>
      s.id === editingServer.id
        ? {
            ...s,
            name: formData.name,
            hostname: formData.hostname,
            port: formData.port,
            username: formData.username,
            ssh_key_id: formData.ssh_key_id || undefined,
            tenants: formData.tenants
          }
        : s
    );

    saveServers(updated);
    setEditingServer(null);
    resetForm();
  };

  const handleDeleteServer = (id: string) => {
    if (confirm('Are you sure you want to delete this server?')) {
      saveServers(servers.filter(s => s.id !== id));
    }
  };

  const handleTestConnection = async (server: ServerConfig) => {
    if (!server.ssh_key_id) {
      alert('Please assign an SSH key to this server first');
      return;
    }

    setTestingServer(server.id);

    try {
      // Get the SSH key
      const keyData = localStorage.getItem(`ssh_key_${server.ssh_key_id}`);
      if (!keyData) {
        throw new Error('SSH key not found');
      }

      const key = JSON.parse(keyData);

      const result = await testConnection({
        hostname: server.hostname,
        private_key: key.private_key,
        username: server.username,
        port: server.port
      });

      // Update server status
      const updated = servers.map(s =>
        s.id === server.id
          ? {
              ...s,
              status: result.success ? 'online' as const : 'offline' as const,
              os_info: result.os_info,
              last_check: new Date().toISOString()
            }
          : s
      );
      saveServers(updated);
    } catch (error: any) {
      const updated = servers.map(s =>
        s.id === server.id
          ? {
              ...s,
              status: 'offline' as const,
              last_check: new Date().toISOString()
            }
          : s
      );
      saveServers(updated);
    } finally {
      setTestingServer(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      hostname: '',
      port: 22,
      username: 'root',
      ssh_key_id: '',
      tenants: []
    });
  };

  const startEditing = (server: ServerConfig) => {
    setFormData({
      name: server.name,
      hostname: server.hostname,
      port: server.port,
      username: server.username,
      ssh_key_id: server.ssh_key_id || '',
      tenants: server.tenants
    });
    setEditingServer(server);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Online
          </Badge>
        );
      case 'offline':
        return (
          <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="w-3 h-3 mr-1" />
            Offline
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            Unknown
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Server Registry
            </CardTitle>
            <CardDescription>
              Manage your production servers and their SSH configurations
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Server
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add New Server</DialogTitle>
                <DialogDescription>
                  Add a new server to your DevOps infrastructure
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Server Name</Label>
                  <Input
                    id="name"
                    placeholder="Production Server"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="hostname">Hostname / IP</Label>
                    <Input
                      id="hostname"
                      placeholder="91.99.229.96"
                      value={formData.hostname}
                      onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ssh_key">SSH Key</Label>
                    <Select
                      value={formData.ssh_key_id}
                      onValueChange={(value) => setFormData({ ...formData, ssh_key_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select SSH key" />
                      </SelectTrigger>
                      <SelectContent>
                        {sshKeys.map((key) => (
                          <SelectItem key={key.id} value={key.id}>
                            {key.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tenants">Tenants (comma-separated)</Label>
                  <Input
                    id="tenants"
                    placeholder="geolex, vergilex, bookie"
                    value={formData.tenants.join(', ')}
                    onChange={(e) => setFormData({
                      ...formData,
                      tenants: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                    })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddServer} disabled={!formData.name || !formData.hostname}>
                  Add Server
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : servers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No servers configured yet</p>
              <p className="text-sm">Click "Add Server" to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Tenants</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Check</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell className="font-medium">{server.name}</TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {server.username}@{server.hostname}:{server.port}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {server.tenants.map((tenant) => (
                          <Badge key={tenant} variant="outline" className="text-xs">
                            {tenant}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(server.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {server.last_check
                        ? new Date(server.last_check).toLocaleString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTestConnection(server)}
                          disabled={testingServer === server.id}
                          title="Test connection"
                        >
                          {testingServer === server.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(server)}
                          title="Edit server"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteServer(server.id)}
                          className="text-destructive hover:text-destructive"
                          title="Delete server"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Server Dialog */}
      <Dialog open={!!editingServer} onOpenChange={(open) => !open && setEditingServer(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Server</DialogTitle>
            <DialogDescription>
              Update server configuration
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Server Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-hostname">Hostname / IP</Label>
                <Input
                  id="edit-hostname"
                  value={formData.hostname}
                  onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-port">Port</Label>
                <Input
                  id="edit-port"
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-username">Username</Label>
                <Input
                  id="edit-username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-ssh_key">SSH Key</Label>
                <Select
                  value={formData.ssh_key_id}
                  onValueChange={(value) => setFormData({ ...formData, ssh_key_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select SSH key" />
                  </SelectTrigger>
                  <SelectContent>
                    {sshKeys.map((key) => (
                      <SelectItem key={key.id} value={key.id}>
                        {key.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-tenants">Tenants (comma-separated)</Label>
              <Input
                id="edit-tenants"
                value={formData.tenants.join(', ')}
                onChange={(e) => setFormData({
                  ...formData,
                  tenants: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingServer(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateServer}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
