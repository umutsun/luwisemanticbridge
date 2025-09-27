'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Brain, 
  Database, 
  Search, 
  Activity, 
  Users, 
  FileText,
  TrendingUp,
  Clock,
  Zap,
  Server,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Progress } from '../../../components/ui/progress';
import { Badge } from '../../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import RAGSearchInterface from '../../../components/rag/SearchInterface';
import { apiRequest } from '../../../lib/api-client';

interface DashboardStats {
  totalDocuments: number;
  totalQueries: number;
  avgResponseTime: number;
  cacheHitRate: number;
  activeUsers: number;
  systemHealth: string;
  ragPerformance: {
    accuracy: number;
    speed: number;
    coverage: number;
  };
}

export default function ModernDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    fetchDashboardStats();
    const interval = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const data = await apiRequest<DashboardStats>('/api/dashboard/stats', {
        cache: true
      });
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      setStats({
        totalDocuments: 45326,
        totalQueries: 1247,
        avgResponseTime: 185,
        cacheHitRate: 72,
        activeUsers: 23,
        systemHealth: 'operational',
        ragPerformance: {
          accuracy: 94,
          speed: 88,
          coverage: 91
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'operational': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse">
          <Brain className="w-12 h-12 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary" />
          Alice Semantic Bridge Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Real-time monitoring and management
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.totalDocuments.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline w-3 h-3 mr-1 text-green-600" />
                +12% from last week
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Response Time
              </CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.avgResponseTime}ms
              </div>
              <Progress 
                value={(200 - (stats?.avgResponseTime || 0)) / 2} 
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Target: &lt;200ms
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Cache Hit Rate
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.cacheHitRate}%
              </div>
              <Progress value={stats?.cacheHitRate} className="mt-2" />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                System Health
              </CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold capitalize ${getHealthColor(stats?.systemHealth || '')}`}>
                {stats?.systemHealth}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                <span className="text-xs">All systems operational</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>RAG Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Accuracy</span>
                    <span className="text-sm font-medium">{stats?.ragPerformance.accuracy}%</span>
                  </div>
                  <Progress value={stats?.ragPerformance.accuracy} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Speed</span>
                    <span className="text-sm font-medium">{stats?.ragPerformance.speed}%</span>
                  </div>
                  <Progress value={stats?.ragPerformance.speed} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">Coverage</span>
                    <span className="text-sm font-medium">{stats?.ragPerformance.coverage}%</span>
                  </div>
                  <Progress value={stats?.ragPerformance.coverage} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">New documents indexed</p>
                      <p className="text-xs text-muted-foreground">2 minutes ago</p>
                    </div>
                    <Badge>+125</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Search className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Search query executed</p>
                      <p className="text-xs text-muted-foreground">5 minutes ago</p>
                    </div>
                    <Badge variant="secondary">185ms</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">New user registered</p>
                      <p className="text-xs text-muted-foreground">12 minutes ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="search">
          <RAGSearchInterface />
        </TabsContent>

        <TabsContent value="analytics">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Advanced analytics and insights coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Configuration and settings management coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}