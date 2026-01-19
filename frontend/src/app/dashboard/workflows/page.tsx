'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { useCache } from '@/lib/cache';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  GitBranch,
  Play,
  Pause,
  Plus,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Download,
  Upload,
  Eye,
  Trash2,
  Edit,
  Copy,
  ExternalLink,
  Zap,
  Bot,
  Database,
  Globe,
  FileJson
} from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'error';
  nodes: number;
  executions: number;
  lastRun?: Date;
  createdAt: Date;
  tags: string[];
  type: 'rag' | 'scraper' | 'embedding' | 'automation' | 'custom';
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: unknown[];
  icon: React.ReactNode;
}

export default function WorkflowsPage() {
  const { t } = useTranslation();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [n8nWorkflows, setN8nWorkflows] = useState<unknown[]>([]);
  const [executions, setExecutions] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newWorkflow, setNewWorkflow] = useState({
    name: '',
    description: '',
    type: 'custom',
  });
  const [activeTab, setActiveTab] = useState('workflows');

  const templates: WorkflowTemplate[] = [
    {
      id: '1',
      name: t('workflows.types.rag'),
      description: 'Web scraping → Chunking → Embedding → pgvector storage',
      category: 'rag',
      nodes: [],
      icon: <Bot className="h-5 w-5" />,
    },
    {
      id: '2',
      name: t('documents.operations.title'),
      description: 'PDF/TXT upload → Text extraction → Embedding generation',
      category: 'embedding',
      nodes: [],
      icon: <FileJson className="h-5 w-5" />,
    },
    {
      id: '3',
      name: t('workflows.types.scraper'),
      description: 'Schedule web scraping → Change detection → Notification',
      category: 'scraper',
      nodes: [],
      icon: <Globe className="h-5 w-5" />,
    },
    {
      id: '4',
      name: t('workflows.types.automation'),
      description: 'HTTP webhook → Query embedding → Vector search → Response',
      category: 'automation',
      nodes: [],
      icon: <Database className="h-5 w-5" />,
    },
  ];

  useEffect(() => {
    fetchWorkflows();
    fetchN8nWorkflows();
    fetchExecutions();
  }, []);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || ''}/api/v2/workflows`);
      const data = await response.json();
      setWorkflows(data.workflows || [
        // Demo data
        {
          id: '1',
          name: 'LSEM RAG Pipeline',
          description: 'Main RAG workflow for document processing',
          status: 'active',
          nodes: 8,
          executions: 156,
          lastRun: new Date(),
          createdAt: new Date(),
          tags: ['rag', 'production'],
          type: 'rag',
        },
        {
          id: '2',
          name: 'Daily Web Scraper',
          description: 'Scheduled scraping of news sites',
          status: 'active',
          nodes: 5,
          executions: 42,
          lastRun: new Date(),
          createdAt: new Date(),
          tags: ['scraper', 'scheduled'],
          type: 'scraper',
        },
      ]);
    } catch (error) {
      console.error('Failed to fetch workflows:', error);
    }
  };

  const fetchN8nWorkflows = async () => {
    try {
      // This would normally use the MCP tools
      // For now, we'll mock the data
      setN8nWorkflows([
        {
          id: 'n8n-1',
          name: 'LSEM Document Processing',
          active: true,
          nodes: [
            { id: '1', type: 'Start', position: [100, 100] },
            { id: '2', type: 'HTTP Request', position: [200, 100] },
            { id: '3', type: 'Code', position: [300, 100] },
            { id: '4', type: 'Postgres', position: [400, 100] }
          ],
          connections: {},
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
    } catch (error) {
      console.error('Failed to fetch n8n workflows:', error);
    }
  };

  const fetchExecutions = async () => {
    try {
      // Mock execution data
      setExecutions([
        {
          id: 'exec-1',
          workflowId: '1',
          status: 'success',
          startedAt: new Date(Date.now() - 300000),
          finishedAt: new Date(Date.now() - 280000),
          data: {
            result: { count: 42 }
          }
        },
        {
          id: 'exec-2',
          workflowId: '2',
          status: 'running',
          startedAt: new Date(Date.now() - 60000),
          finishedAt: null,
          data: {}
        }
      ]);
    } catch (error) {
      console.error('Failed to fetch executions:', error);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!newWorkflow.name) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || ''}/api/v2/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkflow),
      });

      if (response.ok) {
        await fetchWorkflows();
        setIsCreateDialogOpen(false);
        setNewWorkflow({ name: '', description: '', type: 'custom' });
      }
    } catch (error) {
      console.error('Failed to create workflow:', error);
    }
  };

  const handleDeployTemplate = async (template: WorkflowTemplate) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || ''}/api/v2/workflows/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id }),
      });

      if (response.ok) {
        await fetchWorkflows();
      }
    } catch (error) {
      console.error('Failed to deploy template:', error);
    }
  };

  const handleToggleWorkflow = async (workflow: Workflow) => {
    try {
      const newStatus = workflow.status === 'active' ? 'inactive' : 'active';
      const response = await fetch('http://localhost:3003/api/v2/workflows/' + workflow.id + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setWorkflows(workflows.map(w =>
          w.id === workflow.id ? { ...w, status: newStatus } : w
        ));
      }
    } catch (error) {
      console.error('Failed to toggle workflow:', error);
    }
  };

  const getStatusIcon = (status: Workflow['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getTypeIcon = (type: Workflow['type']) => {
    switch (type) {
      case 'rag':
        return <Bot className="h-4 w-4" />;
      case 'scraper':
        return <Globe className="h-4 w-4" />;
      case 'embedding':
        return <Database className="h-4 w-4" />;
      case 'automation':
        return <Zap className="h-4 w-4" />;
      default:
        return <GitBranch className="h-4 w-4" />;
    }
  };

  return (
    <div className="py-6 space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="workflows">{t('workflows.tabs.workflows')}</TabsTrigger>
          <TabsTrigger value="executions">{t('workflows.tabs.executions')}</TabsTrigger>
          <TabsTrigger value="templates">{t('workflows.tabs.templates')}</TabsTrigger>
          <TabsTrigger value="settings">{t('workflows.tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">{t('workflows.header.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t('workflows.header.description')}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <a href="http://localhost:5678" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('workflows.header.n8nPanel')}
                </a>
              </Button>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('workflows.header.newWorkflow')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('workflows.createDialog.title')}</DialogTitle>
                    <DialogDescription>
                      {t('workflows.createDialog.description')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">{t('workflows.createDialog.name')}</label>
                      <Input
                        value={newWorkflow.name}
                        onChange={(e) => setNewWorkflow({ ...newWorkflow, name: e.target.value })}
                        placeholder={t('workflows.createDialog.namePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('workflows.createDialog.description')}</label>
                      <Textarea
                        value={newWorkflow.description}
                        onChange={(e) => setNewWorkflow({ ...newWorkflow, description: e.target.value })}
                        placeholder={t('workflows.createDialog.descriptionPlaceholder')}
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('workflows.createDialog.type')}</label>
                      <select
                        value={newWorkflow.type}
                        onChange={(e) => setNewWorkflow({ ...newWorkflow, type: e.target.value as 'custom' | 'rag' | 'scraper' | 'embedding' | 'automation' })}
                        className="w-full p-2 border rounded-md"
                      >
                        <option value="custom">{t('workflows.types.custom')}</option>
                        <option value="rag">{t('workflows.types.rag')}</option>
                        <option value="scraper">{t('workflows.types.scraper')}</option>
                        <option value="embedding">{t('workflows.types.embedding')}</option>
                        <option value="automation">{t('workflows.types.automation')}</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button onClick={handleCreateWorkflow}>{t('workflows.createDialog.create')}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('workflows.stats.totalWorkflows')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{workflows.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('workflows.stats.active')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {workflows.filter(w => w.status === 'active').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('workflows.stats.totalExecutions')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {workflows.reduce((sum, w) => sum + w.executions, 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('workflows.stats.nodeCount')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {workflows.reduce((sum, w) => sum + w.nodes, 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workflow Templates */}
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.templates.title')}</CardTitle>
              <CardDescription>
                {t('workflows.templates.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {template.icon}
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                        </div>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={() => handleDeployTemplate(template)}
                        className="w-full"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {t('workflows.templates.deploy')}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Active Workflows */}
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.activeWorkflows.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : workflows.length === 0 ? (
                <div className="text-center py-12">
                  <GitBranch className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">{t('workflows.activeWorkflows.noWorkflows')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workflows.map((workflow) => (
                    <Card key={workflow.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {getTypeIcon(workflow.type)}
                              <h3 className="font-semibold">{workflow.name}</h3>
                              {getStatusIcon(workflow.status)}
                              <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
                                {t(`workflows.status.${workflow.status}`)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {workflow.description}
                            </p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{workflow.nodes} nodes</span>
                              <span>•</span>
                              <span>{workflow.executions} {t('workflows.executions.title')}</span>
                              {workflow.lastRun && (
                                <>
                                  <span>•</span>
                                  <span>{t('common.lastUpdated')}: {new Date(workflow.lastRun).toLocaleString()}</span>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {workflow.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleWorkflow(workflow)}
                            >
                              {workflow.status === 'active' ?
                                <Pause className="h-4 w-4" /> :
                                <Play className="h-4 w-4" />
                              }
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                            >
                              <a href={'http://localhost:5678/workflow/' + workflow.id} target="_blank" rel="noopener noreferrer">
                                <Edit className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Workflow Templates */}
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.templates.title')}</CardTitle>
              <CardDescription>
                {t('workflows.templates.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {template.icon}
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                        </div>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={() => handleDeployTemplate(template)}
                        className="w-full"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {t('workflows.templates.deploy')}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Active Workflows */}
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.activeWorkflows.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : workflows.length === 0 ? (
                <div className="text-center py-12">
                  <GitBranch className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-muted-foreground">{t('workflows.activeWorkflows.noWorkflows')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workflows.map((workflow) => (
                    <Card key={workflow.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {getTypeIcon(workflow.type)}
                              <h3 className="font-semibold">{workflow.name}</h3>
                              {getStatusIcon(workflow.status)}
                              <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
                                {t(`workflows.status.${workflow.status}`)}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {workflow.description}
                            </p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>{workflow.nodes} nodes</span>
                              <span>•</span>
                              <span>{workflow.executions} {t('workflows.executions.title')}</span>
                              {workflow.lastRun && (
                                <>
                                  <span>•</span>
                                  <span>{t('common.lastUpdated')}: {new Date(workflow.lastRun).toLocaleString()}</span>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {workflow.tags.map(tag => (
                                <Badge key={tag} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleWorkflow(workflow)}
                            >
                              {workflow.status === 'active' ?
                                <Pause className="h-4 w-4" /> :
                                <Play className="h-4 w-4" />
                              }
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                            >
                              <a href={'http://localhost:5678/workflow/' + workflow.id} target="_blank" rel="noopener noreferrer">
                                <Edit className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="executions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.executions.title')}</CardTitle>
              <CardDescription>{t('workflows.executions.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {executions.map((execution: any) => (
                  <Card key={execution.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{t('workflows.executions.execution')} #{execution.id}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('workflows.executions.workflowId')}: {execution.workflowId}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('workflows.executions.started')}: {new Date(execution.startedAt).toLocaleString()}
                            {execution.finishedAt && (
                              <> • {t('workflows.executions.finished')}: {new Date(execution.finishedAt).toLocaleString()}</>
                            )}
                          </p>
                        </div>
                        <Badge
                          variant={
                            execution.status === 'success' ? 'default' :
                              execution.status === 'running' ? 'secondary' :
                                'error'
                          }
                        >
                          {t(`workflows.status.${execution.status}`)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.templateGallery.title')}</CardTitle>
              <CardDescription>
                {t('workflows.templateGallery.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-all hover:scale-105">
                    <CardHeader>
                      <div className="flex items-center justify-center mb-4">
                        <div className="p-4 rounded-full bg-primary/10">
                          {template.icon}
                        </div>
                      </div>
                      <CardTitle className="text-center">{template.name}</CardTitle>
                      <CardDescription className="text-center">
                        {template.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={() => handleDeployTemplate(template)}
                        className="w-full"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {t('workflows.templateGallery.useTemplate')}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('workflows.settings.title')}</CardTitle>
              <CardDescription>
                {t('workflows.settings.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('workflows.settings.n8nUrl')}</label>
                  <Input defaultValue="http://localhost:5678" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('workflows.settings.apiKey')}</label>
                  <Input type="password" defaultValue="••••••••" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('workflows.settings.defaultExecutionSettings')}</label>
                <select className="w-full p-2 border rounded-md">
                  <option>{t('workflows.settings.manual')}</option>
                  <option>{t('workflows.settings.scheduled')}</option>
                  <option>{t('workflows.settings.webhookTrigger')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('workflows.settings.errorSettings')}</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">{t('workflows.settings.sendEmailOnErrors')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">{t('workflows.settings.autoRetry')}</span>
                  </label>
                </div>
              </div>
              <Button>
                <Settings className="mr-2 h-4 w-4" />
                {t('workflows.settings.saveSettings')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}