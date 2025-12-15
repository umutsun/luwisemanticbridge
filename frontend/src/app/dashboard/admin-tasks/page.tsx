'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import {
  Plus,
  Trash2,
  Edit,
  ExternalLink,
  MapPin,
  Calendar,
  User,
  Clock,
  CheckCircle,
  Circle,
  Loader2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import useAdminTodoStore from '@/stores/admin-todo.store';
import useAuthStore from '@/stores/auth.store';
import { useSocketIO } from '@/hooks/useSocketIO';
import { AdminTodo, CreateTodoData, TodoStatus, TodoPriority } from '@/types/admin-todo';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

const priorityColors: Record<TodoPriority, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
};

const priorityLabels: Record<TodoPriority, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil'
};

const statusIcons: Record<TodoStatus, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-gray-400" />,
  in_progress: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />
};

const statusLabels: Record<TodoStatus, string> = {
  pending: 'Bekliyor',
  in_progress: 'Devam Ediyor',
  completed: 'Tamamlandı'
};

export default function AdminTasksPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const {
    todos,
    loading,
    error,
    fetchTodos,
    createTodo,
    updateTodo,
    deleteTodo,
    changeStatus,
    addTodo,
    updateTodoLocal,
    removeTodo,
    clearError
  } = useAdminTodoStore();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTodo, setEditingTodo] = useState<AdminTodo | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateTodoData>({
    title: '',
    description: '',
    link: '',
    location: '',
    priority: 'normal',
    dueDate: ''
  });

  // WebSocket for real-time updates
  const websocketUrl = process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || '';
  const { socket, isConnected } = useSocketIO(websocketUrl, {
    reconnectAttempts: 3,
    reconnectInterval: 5000,
    enableLogs: false
  });

  // Join admin room on connect
  useEffect(() => {
    if (socket && isConnected && user?.role === 'admin') {
      socket.emit('admin:join', { userId: user.id, role: user.role });

      // Listen for todo events
      socket.on('admin:todo:created', (todo: AdminTodo) => {
        addTodo(todo);
      });

      socket.on('admin:todo:updated', (todo: AdminTodo) => {
        updateTodoLocal(todo);
      });

      socket.on('admin:todo:deleted', (data: { id: string }) => {
        removeTodo(data.id);
      });

      return () => {
        socket.emit('admin:leave');
        socket.off('admin:todo:created');
        socket.off('admin:todo:updated');
        socket.off('admin:todo:deleted');
      };
    }
  }, [socket, isConnected, user]);

  // Fetch todos on mount
  useEffect(() => {
    fetchTodos();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    const filters: any = {};
    if (statusFilter !== 'all') filters.status = statusFilter;
    if (priorityFilter !== 'all') filters.priority = priorityFilter;
    fetchTodos(filters);
  }, [statusFilter, priorityFilter]);

  // Handle create
  const handleCreate = async () => {
    if (!formData.title.trim()) return;

    const result = await createTodo(formData);
    if (result) {
      setShowCreateDialog(false);
      resetForm();
    }
  };

  // Handle update
  const handleUpdate = async () => {
    if (!editingTodo || !formData.title.trim()) return;

    const result = await updateTodo(editingTodo.id, formData);
    if (result) {
      setShowEditDialog(false);
      setEditingTodo(null);
      resetForm();
    }
  };

  // Handle status change
  const handleStatusChange = async (todo: AdminTodo, newStatus: TodoStatus) => {
    await changeStatus(todo.id, newStatus);
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    await deleteTodo(id);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      link: '',
      location: '',
      priority: 'normal',
      dueDate: ''
    });
  };

  // Open edit dialog
  const openEditDialog = (todo: AdminTodo) => {
    setEditingTodo(todo);
    setFormData({
      title: todo.title,
      description: todo.description || '',
      link: todo.link || '',
      location: todo.location || '',
      priority: todo.priority,
      dueDate: todo.dueDate || ''
    });
    setShowEditDialog(true);
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: tr });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="w-[95%] mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin Görevleri</h1>
          <p className="text-muted-foreground text-sm">
            Kim, ne yapıyor, nerede? Ekip koordinasyonu için görev takibi
            {isConnected && (
              <span className="ml-2 inline-flex items-center text-green-600">
                <span className="h-2 w-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                Canlı
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchTodos()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Yeni Görev
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni Görev Oluştur</DialogTitle>
                <DialogDescription>
                  Diğer adminlerle paylaşılacak yeni bir görev ekleyin
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Başlık *</Label>
                  <Input
                    placeholder="Ne yapılacak?"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Açıklama</Label>
                  <Textarea
                    placeholder="Detaylar..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Konum</Label>
                    <Input
                      placeholder="Nerede?"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Öncelik</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: TodoPriority) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Düşük</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Yüksek</SelectItem>
                        <SelectItem value="urgent">Acil</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Link</Label>
                    <Input
                      placeholder="https://..."
                      value={formData.link}
                      onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tarih</Label>
                    <Input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>İptal</Button>
                <Button onClick={handleCreate} disabled={!formData.title.trim()}>Oluştur</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Durum:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="pending">Bekliyor</SelectItem>
              <SelectItem value="in_progress">Devam Ediyor</SelectItem>
              <SelectItem value="completed">Tamamlandı</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Öncelik:</Label>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="urgent">Acil</SelectItem>
              <SelectItem value="high">Yüksek</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Düşük</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError}>Kapat</Button>
        </div>
      )}

      {/* Todo List */}
      <Card>
        <CardContent className="p-0">
          {loading && todos.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : todos.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mb-2" />
              <p>Henüz görev yok</p>
              <p className="text-sm">Yeni görev ekleyerek başlayın</p>
            </div>
          ) : (
            <div className="divide-y">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className={`p-4 hover:bg-muted/50 transition-colors ${todo.status === 'completed' ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Status checkbox */}
                    <div className="pt-1">
                      <button
                        onClick={() => handleStatusChange(
                          todo,
                          todo.status === 'completed' ? 'pending' :
                            todo.status === 'pending' ? 'in_progress' : 'completed'
                        )}
                        className="hover:scale-110 transition-transform"
                      >
                        {statusIcons[todo.status]}
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-medium ${todo.status === 'completed' ? 'line-through' : ''}`}>
                          {todo.title}
                        </h3>
                        <Badge className={priorityColors[todo.priority]}>
                          {priorityLabels[todo.priority]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {statusLabels[todo.status]}
                        </Badge>
                      </div>

                      {todo.description && (
                        <p className="text-sm text-muted-foreground mb-2">{todo.description}</p>
                      )}

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {todo.createdByName}
                        </span>

                        {todo.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {todo.location}
                          </span>
                        )}

                        {todo.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(todo.dueDate).toLocaleDateString('tr-TR')}
                          </span>
                        )}

                        {todo.link && (
                          <a
                            href={todo.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Link
                          </a>
                        )}

                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(todo.createdAt)}
                        </span>

                        {todo.completedByName && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            {todo.completedByName} tamamladı
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(todo)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <ConfirmTooltip
                        title="Görevi Sil"
                        description="Bu görev kalıcı olarak silinecek."
                        onConfirm={() => handleDelete(todo.id)}
                      >
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </ConfirmTooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Görevi Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Başlık *</Label>
              <Input
                placeholder="Ne yapılacak?"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Textarea
                placeholder="Detaylar..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Konum</Label>
                <Input
                  placeholder="Nerede?"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Öncelik</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: TodoPriority) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Düşük</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Yüksek</SelectItem>
                    <SelectItem value="urgent">Acil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link</Label>
                <Input
                  placeholder="https://..."
                  value={formData.link}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Tarih</Label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>İptal</Button>
            <Button onClick={handleUpdate} disabled={!formData.title.trim()}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
