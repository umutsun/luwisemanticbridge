'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { ConfirmTooltip } from '@/components/ui/confirm-tooltip';
import { apiConfig } from '@/config/api.config';
import { fetchWithAuth } from '@/lib/auth-fetch';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'premium';
  status: 'active' | 'inactive' | 'suspended';
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  token_usage?: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    monthly_limit: number;
    usage_percentage: number;
    remaining_tokens: number;
  };
  subscription?: {
    id: string | null;
    plan_id: string | null;
    plan_name: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    monthly_limit: number | null;
    features: string[];
    created_at: string | null;
  };
  message_stats?: {
    total_messages: number;
    total_sessions: number;
    avg_messages_per_session: number;
    total_question_tokens: number;
    total_answer_tokens: number;
    last_activity?: string;
  };
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  monthly_tokens: number;
  features: string[];
  is_active: boolean;
}

export default function UsersPage() {

  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    price: 0,
    monthly_tokens: 0,
    features: [''],
    is_active: true
  });

  // Fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true);

      // Fetch users from API
      const response = await fetchWithAuth('/api/v2/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();

      // Mock plans for now
      const mockPlans = [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          monthly_tokens: 10000,
          features: ['Basic chat', 'Limited search'],
          is_active: true
        },
        {
          id: 'premium',
          name: 'Premium',
          price: 29.99,
          monthly_tokens: 100000,
          features: ['Unlimited chat', 'Advanced search', 'Priority support'],
          is_active: true
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 99.99,
          monthly_tokens: 1000000,
          features: ['All features', 'API access', 'Custom integrations'],
          is_active: true
        }
      ];

      setUsers(data.users || data || []);
      setPlans(mockPlans);
      setError(null);
    } catch (error) {
      console.error('Error fetching users:', error);
      setError('Failed to fetch users');

      // Fallback to mock data
      const mockUsers = [
        {
          id: '1',
          email: 'admin@asemb.com',
          name: 'System Admin',
          role: 'admin' as const,
          status: 'active' as const,
          email_verified: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          last_login: '2024-01-18T10:30:00Z',
          subscription: {
            id: 'sub_1',
            plan_id: 'enterprise',
            plan_name: 'Enterprise',
            status: 'active',
            start_date: '2024-01-01T00:00:00Z',
            end_date: '2024-02-01T00:00:00Z',
            monthly_limit: 1000000,
            features: ['All features', 'API access'],
            created_at: '2024-01-01T00:00:00Z'
          },
          token_usage: {
            total_tokens: 15000,
            input_tokens: 8000,
            output_tokens: 7000,
            monthly_limit: 1000000,
            usage_percentage: 1.5,
            remaining_tokens: 985000
          },
          message_stats: {
            total_messages: 125,
            total_sessions: 15,
            avg_messages_per_session: 8.33,
            total_question_tokens: 12000,
            total_answer_tokens: 13000,
            last_activity: '2024-01-18T09:45:00Z'
          }
        },
        {
          id: '2',
          email: 'user@example.com',
          name: 'John Doe',
          role: 'user' as const,
          status: 'active' as const,
          email_verified: true,
          created_at: '2024-01-05T00:00:00Z',
          updated_at: '2024-01-05T00:00:00Z',
          last_login: '2024-01-18T08:20:00Z',
          subscription: {
            id: 'sub_2',
            plan_id: 'premium',
            plan_name: 'Premium',
            status: 'active',
            start_date: '2024-01-05T00:00:00Z',
            end_date: '2024-02-05T00:00:00Z',
            monthly_limit: 100000,
            features: ['Unlimited chat', 'Advanced search'],
            created_at: '2024-01-05T00:00:00Z'
          },
          token_usage: {
            total_tokens: 45000,
            input_tokens: 28000,
            output_tokens: 17000,
            monthly_limit: 100000,
            usage_percentage: 45,
            remaining_tokens: 55000
          },
          message_stats: {
            total_messages: 342,
            total_sessions: 28,
            avg_messages_per_session: 12.21,
            total_question_tokens: 35000,
            total_answer_tokens: 37000,
            last_activity: '2024-01-17T16:30:00Z'
          }
        }
      ];

      setUsers(mockUsers);
      setPlans(mockPlans);
    } finally {
      setLoading(false);
    }
  };

  // Update user subscription
  const handleUpdateSubscription = async (userId: string, planId: string) => {
    try {
      console.log(`Updating subscription for user ${userId} to plan ${planId}`);

      const requestBody = JSON.stringify({ plan_id: planId });
      console.log('Request body:', requestBody);

      const response = await fetchWithAuth(`/api/v2/users/${userId}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });

      console.log('Response status:', response.status, response.statusText);

      const plan = plans.find(p => p.id === planId);
      if (!plan) {
        throw new Error(`Plan with ID ${planId} not found`);
      }

      let apiSuccess = true;
      let errorMessage = '';

      // Handle case where response might be null or undefined (network error, etc.)
      if (!response) {
        apiSuccess = false;
        errorMessage = 'No response received from server';
        console.error('Subscription update failed: No response received');
      } else if (!response.ok) {
        apiSuccess = false;
        try {
          const errorText = await response.text();
          const status = response.status;
          const statusText = response.statusText;

          console.error('Subscription update failed:');
          console.error('- Status:', status);
          console.error('- Status Text:', statusText);
          console.error('- Error Text:', errorText || 'No error text provided');
          console.error('- URL:', `/api/v2/users/${userId}/subscription`);

          errorMessage = `API Error (${status}): ${errorText}`;
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorMessage = `API Error (${response.status}): Unable to parse error response`;
        }

        // Continue with local update even if API fails, but show a warning
        console.warn('API update failed, updating local state only');
      }

      // Always update local state for better UX
      setUsers(prev => prev.map(user =>
        user.id === userId
          ? {
              ...user,
              subscription: {
                ...user.subscription,
                plan_id: planId,
                plan_name: plan.name,
                monthly_limit: plan.monthly_tokens,
                status: 'active',
                start_date: new Date().toISOString(),
                end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
                features: [...plan.features]
              },
              token_usage: {
                ...user.token_usage,
                monthly_limit: plan.monthly_tokens,
                usage_percentage: user.token_usage ?
                  Math.round((user.token_usage.total_tokens / plan.monthly_tokens) * 100) : 0,
                remaining_tokens: plan.monthly_tokens - (user.token_usage?.total_tokens || 0)
              }
            }
          : user
      ));

      if (apiSuccess) {
        setError(null); // Clear any previous errors
        console.log(`Successfully updated subscription for user ${userId}`);
      } else {
        // Show warning instead of error for API failures
        setError(`Warning: ${errorMessage}. Local state updated.`);
      }
    } catch (error) {
      console.error('Error updating subscription:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Try to update local state even on catch errors
      const plan = plans.find(p => p.id === planId);
      if (plan) {
        setUsers(prev => prev.map(user =>
          user.id === userId
            ? {
                ...user,
                subscription: {
                  ...user.subscription,
                  plan_id: planId,
                  plan_name: plan.name,
                  monthly_limit: plan.monthly_tokens,
                  status: 'active'
                },
                token_usage: {
                  ...user.token_usage,
                  monthly_limit: plan.monthly_tokens,
                  usage_percentage: user.token_usage ?
                    Math.round((user.token_usage.total_tokens / plan.monthly_tokens) * 100) : 0,
                  remaining_tokens: plan.monthly_tokens - (user.token_usage?.total_tokens || 0)
                }
              }
            : user
        ));
        setError(`Warning: Local update completed. API error: ${errorMsg}`);
      } else {
        setError(`Failed to update subscription: ${errorMsg}`);
      }
    }
  };

  // Toggle user status
  const handleToggleStatus = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    try {
      const newStatus = user.status === 'active' ? 'inactive' : 'active';
      const response = await fetchWithAuth(`/api/v2/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) throw new Error('Failed to update status');

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, status: newStatus } : u
      ));
    } catch (error) {
      console.error('Error updating status:', error);
      setError('Failed to update user status');
    }
  };

  // Reset user password
  const handleResetPassword = async (userId: string, password: string) => {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/v2/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (!response.ok) throw new Error('Failed to reset password');

      setShowResetPasswordDialog(false);
      setNewPassword('');
      setError(null);
      // Show success message (you could add a toast notification here)
      alert('Password reset successfully');
    } catch (error) {
      console.error('Error resetting password:', error);
      setError('Failed to reset password');
    }
  };

  // Add new subscription plan
  const handleAddPlan = () => {
    setEditingPlan(null);
    setPlanForm({
      name: '',
      price: 0,
      monthly_tokens: 0,
      features: [''],
      is_active: true
    });
    setShowSubscriptionDialog(true);
  };

  // Edit subscription plan
  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      price: plan.price,
      monthly_tokens: plan.monthly_tokens,
      features: [...plan.features],
      is_active: plan.is_active
    });
    setShowSubscriptionDialog(true);
  };

  // Save subscription plan
  const handleSavePlan = () => {
    if (!planForm.name.trim()) {
      setError('Plan name is required');
      return;
    }

    const newPlan: SubscriptionPlan = {
      id: editingPlan?.id || `plan_${Date.now()}`,
      name: planForm.name,
      price: planForm.price,
      monthly_tokens: planForm.monthly_tokens,
      features: planForm.features.filter(f => f.trim()),
      is_active: planForm.is_active
    };

    if (editingPlan) {
      // Update existing plan
      setPlans(prev => prev.map(p => p.id === editingPlan.id ? newPlan : p));
    } else {
      // Add new plan
      setPlans(prev => [...prev, newPlan]);
    }

    setShowSubscriptionDialog(false);
    setEditingPlan(null);
    setError(null);
  };

  // Delete subscription plan
  const handleDeletePlan = (planId: string) => {
    setPlans(prev => prev.filter(p => p.id !== planId));
  };

  // Add feature to plan
  const handleAddFeature = () => {
    setPlanForm(prev => ({
      ...prev,
      features: [...prev.features, '']
    }));
  };

  // Update feature
  const handleUpdateFeature = (index: number, value: string) => {
    setPlanForm(prev => ({
      ...prev,
      features: prev.features.map((f, i) => i === index ? value : f)
    }));
  };

  // Remove feature
  const handleRemoveFeature = (index: number) => {
    setPlanForm(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Get badge colors
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      case 'premium': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300';
      default: return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'inactive': return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
      case 'suspended': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      default: return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
    }
  };

  const getSubscriptionBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'expired': return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
      case 'cancelled': return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
      default: return 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-300';
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="w-[90%] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">User Management</h1>
        <p className="text-gray-600">Manage users and their subscriptions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Total Users</div>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Active Users</div>
            <div className="text-2xl font-bold text-green-600">
              {users.filter(u => u.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Premium Users</div>
            <div className="text-2xl font-bold text-purple-600">
              {users.filter(u => u.subscription?.plan_id === 'premium').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-600">Total Tokens Used</div>
            <div className="text-2xl font-bold">
              {users.reduce((sum, user) => sum + (user.token_usage?.total_tokens || 0), 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subscription Management - Left Side */}
        <div className="lg:col-span-1">
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Subscription Management</CardTitle>
                  <CardDescription>
                    Overview of all subscription plans and user distribution
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={handleAddPlan}
                  className="text-green-600 hover:text-green-800 hover:bg-green-50"
                >
                  + Add Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {plans.map(plan => {
                const userCount = users.filter(u => u.subscription?.plan_id === plan.id).length;
                const percentage = users.length > 0 ? (userCount / users.length) * 100 : 0;
                const totalTokensUsed = users
                  .filter(u => u.subscription?.plan_id === plan.id)
                  .reduce((sum, user) => sum + (user.token_usage?.total_tokens || 0), 0);
                const avgUsage = userCount > 0 ? totalTokensUsed / userCount : 0;

                return (
                  <div key={plan.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg">{plan.name}</h3>
                        <p className="text-sm text-gray-600">${plan.price}/month</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={plan.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => handleEditPlan(plan)}
                          title="Edit Plan"
                        >
                          ⚙
                        </Button>
                        <ConfirmTooltip
                          onConfirm={() => handleDeletePlan(plan.id)}
                          message="Delete this plan?"
                          side="top"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50"
                            title="Delete Plan"
                          >
                            ×
                          </Button>
                        </ConfirmTooltip>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Users:</span>
                        <span className="font-medium">{userCount}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{percentage.toFixed(1)}% of all users</span>
                        <span>{plan.monthly_tokens.toLocaleString()} tokens/month</span>
                      </div>
                      {userCount > 0 && (
                        <div className="flex justify-between text-xs text-gray-600 pt-2 border-t">
                          <span>Avg usage:</span>
                          <span>{Math.round(avgUsage).toLocaleString()} tokens</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Features:</p>
                      {plan.features.slice(0, 2).map((feature, index) => (
                        <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                          • {feature}
                        </div>
                      ))}
                      {plan.features.length > 2 && (
                        <div className="text-xs text-gray-500">
                          • +{plan.features.length - 2} more features
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Filters and Users Table - Right Side */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Users ({filteredUsers.length})</CardTitle>
              <CardDescription>
                View and manage all system users
              </CardDescription>

              {/* Filters Section */}
              <div className="flex gap-4 pt-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-1">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded mb-1">
                    <div className="grid grid-cols-8 gap-4 h-full items-center px-4">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                      <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-40"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28"></div>
                      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Token Usage</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-600">{user.email}</div>
                          <div className="text-xs text-gray-500">
                            Joined {new Date(user.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(user.role)}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusBadgeColor(user.status)}>
                            {user.status}
                          </Badge>
                          <Switch
                            checked={user.status === 'active'}
                            onCheckedChange={() => handleToggleStatus(user.id)}
                            size="sm"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.subscription ? (
                          <div className="space-y-1">
                            <Select
                              value={user.subscription.plan_id || ''}
                              onValueChange={(value) => handleUpdateSubscription(user.id, value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map(plan => (
                                  <SelectItem key={plan.id} value={plan.id}>
                                    {plan.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Badge className={getSubscriptionBadgeColor(user.subscription.status || '')}>
                              {user.subscription.status}
                            </Badge>
                          </div>
                        ) : (
                          <Select
                            value=""
                            onValueChange={(value) => handleUpdateSubscription(user.id, value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="No plan" />
                            </SelectTrigger>
                            <SelectContent>
                              {plans.map(plan => (
                                <SelectItem key={plan.id} value={plan.id}>
                                  {plan.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.token_usage && (
                          <div className="w-40">
                            <div className="flex justify-between text-sm mb-1">
                              <span>{user.token_usage.usage_percentage}%</span>
                              <span>{user.token_usage.remaining_tokens.toLocaleString()} left</span>
                            </div>
                            <Progress value={Math.min(user.token_usage.usage_percentage, 100)} className="h-2" />
                            <div className="text-xs text-gray-500 mt-1">
                              {user.token_usage.total_tokens.toLocaleString()} / {user.token_usage.monthly_limit.toLocaleString()}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.message_stats && (
                          <div>
                            <div className="font-medium">{user.message_stats.total_messages}</div>
                            <div className="text-xs text-gray-500">
                              {user.message_stats.total_sessions} sessions
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {user.last_login ? (
                            <div>
                              <div>{new Date(user.last_login).toLocaleDateString()}</div>
                              <div className="text-gray-500">
                                {new Date(user.last_login).toLocaleTimeString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500">Never</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowEditDialog(true);
                            }}
                            title="Edit User"
                          >
                            ⚙
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="p-2 text-orange-600 hover:text-orange-800 hover:bg-orange-50"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowResetPasswordDialog(true);
                              setNewPassword('');
                            }}
                            title="Reset Password"
                          >
                            ⋮
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit User Details</DialogTitle>
            <DialogDescription>
              Modify user information and subscription
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <Input value={selectedUser.name} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <Input value={selectedUser.email} disabled className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Role</Label>
                  <Select value={selectedUser.role}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={selectedUser.status}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium">Subscription Plan</Label>
                <Select
                  value={selectedUser.subscription?.plan_id || ''}
                  onValueChange={(value) => handleUpdateSubscription(selectedUser.id, value)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} - ${plan.price}/month ({plan.monthly_tokens.toLocaleString()} tokens)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedUser.token_usage && (
                <div>
                  <Label className="text-sm font-medium">Token Usage</Label>
                  <div className="mt-2 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Used:</span>
                      <span>{selectedUser.token_usage.total_tokens.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Monthly Limit:</span>
                      <span>{selectedUser.token_usage.monthly_limit.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Remaining:</span>
                      <span>{selectedUser.token_usage.remaining_tokens.toLocaleString()}</span>
                    </div>
                    <Progress value={Math.min(selectedUser.token_usage.usage_percentage, 100)} className="h-2" />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">Message Statistics</Label>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium">{selectedUser.message_stats?.total_messages || 0}</div>
                    <div className="text-gray-500">Total Messages</div>
                  </div>
                  <div>
                    <div className="font-medium">{selectedUser.message_stats?.total_sessions || 0}</div>
                    <div className="text-gray-500">Total Sessions</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowEditDialog(false)}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Reset password for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-password" className="text-right">
                New Password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 chars)"
                className="col-span-3"
              />
            </div>
            {error && error.includes('Password') && (
              <div className="text-sm text-red-600 col-span-4 text-center">
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedUser) {
                  handleResetPassword(selectedUser.id, newPassword);
                }
              }}
              disabled={!newPassword || newPassword.length < 6}
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscription Plan Dialog */}
      <Dialog open={showSubscriptionDialog} onOpenChange={setShowSubscriptionDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? 'Edit Subscription Plan' : 'Add New Subscription Plan'}
            </DialogTitle>
            <DialogDescription>
              {editingPlan
                ? 'Modify the subscription plan details and features'
                : 'Create a new subscription plan with pricing and features'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Plan Name</Label>
                <Input
                  value={planForm.name}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Professional"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Price ($/month)</Label>
                <Input
                  type="number"
                  value={planForm.price}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  placeholder="29.99"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Monthly Tokens</Label>
              <Input
                type="number"
                value={planForm.monthly_tokens}
                onChange={(e) => setPlanForm(prev => ({ ...prev, monthly_tokens: parseInt(e.target.value) || 0 }))}
                placeholder="100000"
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Features</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFeature}
                  className="text-green-600 hover:text-green-800 hover:bg-green-50"
                >
                  + Add Feature
                </Button>
              </div>
              <div className="space-y-2">
                {planForm.features.map((feature, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={feature}
                      onChange={(e) => handleUpdateFeature(index, e.target.value)}
                      placeholder="Enter feature description"
                      className="flex-1"
                    />
                    {planForm.features.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveFeature(index)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50 px-2"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={planForm.is_active}
                onCheckedChange={(checked) => setPlanForm(prev => ({ ...prev, is_active: checked }))}
              />
              <Label className="text-sm font-medium">Plan is active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubscriptionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan}>
              {editingPlan ? 'Update Plan' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}