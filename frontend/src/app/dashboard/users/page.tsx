'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users, 
  Search, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Shield, 
  Ban,
  CheckCircle,
  XCircle,
  Mail,
  Calendar,
  Building,
  Crown,
  User,
  UserPlus,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'premium';
  status: 'active' | 'suspended' | 'inactive';
  last_login: string;
  created_at: string;
  subscription?: {
    plan_name: string;
    end_date: string;
  };
  profile?: {
    company_name: string;
  };
}

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/dashboard/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error(t('users.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/dashboard/users/${userId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        toast.success(t('users.statusUpdated'));
        fetchUsers();
      }
    } catch (error) {
      toast.error(t('users.statusUpdateFailed'));
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/dashboard/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        toast.success('Kullanıcı rolü güncellendi');
        fetchUsers();
      }
    } catch (error) {
      toast.error('Rol güncellenemedi');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/dashboard/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast.success('Kullanıcı silindi');
        fetchUsers();
      }
    } catch (error) {
      toast.error('Kullanıcı silinemedi');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    const matchesStatus = selectedStatus === 'all' || user.status === selectedStatus;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    admins: users.filter(u => u.role === 'admin').length,
    premium: users.filter(u => u.role === 'premium').length
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, any> = {
      admin: { variant: 'destructive' as const, icon: Shield },
      premium: { variant: 'secondary' as const, icon: Crown },
      user: { variant: 'outline' as const, icon: User }
    };
    
    const config = variants[role] || variants.user;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {role}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      active: { variant: 'success' as const, icon: CheckCircle },
      suspended: { variant: 'warning' as const, icon: Ban },
      inactive: { variant: 'secondary' as const, icon: XCircle }
    };
    
    const config = variants[status] || variants.inactive;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Kullanıcı Yönetimi
          </h1>
          <p className="text-muted-foreground">Sistem kullanıcılarını yönetin</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Yeni Kullanıcı
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Kullanıcı Ekle</DialogTitle>
              <DialogDescription>
                Manuel olarak yeni kullanıcı oluşturun
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Ad Soyad</Label>
                <Input placeholder="Kullanıcı adı" />
              </div>
              <div>
                <Label>E-posta</Label>
                <Input type="email" placeholder="ornek@email.com" />
              </div>
              <div>
                <Label>Rol</Label>
                <Select defaultValue="user">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Kullanıcı</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">İptal</Button>
              <Button>Kullanıcı Oluştur</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Toplam Kullanıcı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Kayıtlı kullanıcı</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Aktif Kullanıcı</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground">Şu anda aktif</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Admin</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.admins}</div>
            <p className="text-xs text-muted-foreground">Yönetici hesabı</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Premium</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.premium}</div>
            <p className="text-xs text-muted-foreground">Premium üye</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t('users.title')}</CardTitle>
          <CardDescription>{t('users.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="İsim veya e-posta ile ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Roller</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
                <SelectItem value="user">Kullanıcı</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Durumlar</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="suspended">Askıda</SelectItem>
                <SelectItem value="inactive">Pasif</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Son Giriş</TableHead>
                  <TableHead>Kayıt Tarihi</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Yükleniyor...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Kullanıcı bulunamadı
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </div>
                          {user.profile?.company_name && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Building className="h-3 w-3" />
                              {user.profile.company_name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>
                        {user.subscription ? (
                          <Badge variant="outline">
                            {user.subscription.plan_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.last_login ? (
                          <div className="text-sm">
                            {new Date(user.last_login).toLocaleDateString('tr-TR')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Henüz giriş yapmadı</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(user.created_at).toLocaleDateString('tr-TR')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditingUser(user);
                              setIsEditDialogOpen(true);
                            }}>
                              <Edit className="h-4 w-4 mr-2" />
                              Düzenle
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleStatusChange(user.id, user.status === 'active' ? 'suspended' : 'active')}
                            >
                              {user.status === 'active' ? (
                                <>
                                  <Ban className="h-4 w-4 mr-2" />
                                  Askıya Al
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Aktif Et
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteUser(user.id)}>
                              <Trash2 className="h-4 w-4 mr-2" />
                              Sil
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcı Düzenle</DialogTitle>
            <DialogDescription>
              {editingUser?.name} kullanıcısını düzenleyin
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <Label>Ad Soyad</Label>
                <Input value={editingUser.name} disabled />
              </div>
              <div>
                <Label>E-posta</Label>
                <Input value={editingUser.email} disabled />
              </div>
              <div>
                <Label>Rol</Label>
                <Select 
                  value={editingUser.role} 
                  onValueChange={(value) => handleRoleChange(editingUser.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Kullanıcı</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Durum</Label>
                <Select 
                  value={editingUser.status} 
                  onValueChange={(value) => handleStatusChange(editingUser.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="suspended">Askıda</SelectItem>
                    <SelectItem value="inactive">Pasif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}