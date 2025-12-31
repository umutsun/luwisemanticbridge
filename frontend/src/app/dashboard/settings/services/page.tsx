"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import * as LucideIcons from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Play,
  Square,
  Settings as SettingsIcon,
  Activity,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  Brain,
  Database,
  Zap,
  Globe,
  Code,
  GitBranch,
  Server,
  Plus,
  Trash2,
  X,
  Mic,
  RefreshCw,
  Rocket,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Bug,
  Download
} from "lucide-react";
import { toast } from "sonner";
import { usePM2Services, useNginx, useSelfDeploy } from "@/hooks/useDevOps";
import { DebugSettings } from "@/components/settings/DebugSettings";


interface ServiceStatus {
  name: string;
  displayName: string;
  description: string;
  status: "running" | "stopped" | "error" | "starting" | "stopping";
  health?: {
    status: string;
    lastCheck: string;
    details?: any;
  };
  port?: number;
  url?: string;
  version?: string;
  icon: React.ElementType; // Use React.ElementType for type safety
  workerCount?: number; // For pgai worker
}

const iconMap: { [key: string]: React.ElementType } = {
  GitBranch: LucideIcons.GitBranch,
  Code: LucideIcons.Code,
  Globe: LucideIcons.Globe,
  Mic: LucideIcons.Mic,
  Brain: LucideIcons.Brain,
  Zap: LucideIcons.Zap,
  Server: LucideIcons.Server,
  Database: LucideIcons.Database,
  // Add other icons from lucide-react as needed
};

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showPgaiModal, setShowPgaiModal] = useState(false);
  const [pgaiWorkers, setPgaiWorkers] = useState<Array<{id: number, name: string, status: string, table?: string}>>([]);
  const [vectorTables, setVectorTables] = useState<string[]>([]);

  // DevOps hooks
  const { services: pm2Services, loading: pm2Loading, loadServices: loadPM2, restartService } = usePM2Services();
  const { loading: nginxLoading, testConfig, reload: reloadNginx } = useNginx();
  const { deploying, deploy } = useSelfDeploy();

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await fetch("/api/v2/integrations/services");
        if (response.ok) {
          const data = await response.json();
          const servicesWithIcons = data.map((service: any) => ({
            ...service,
            icon: iconMap[service.icon] || LucideIcons.Activity, // Fallback to a default icon
          }));
          setServices(servicesWithIcons);
        } else {
          toast.error("Failed to fetch services list.");
        }
      } catch (error) {
        console.error("Failed to fetch services list:", error);
        toast.error("An error occurred while fetching the services list.");
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
    fetchServicesStatus();
    // Auto-refresh disabled to prevent terminal pop-ups
  }, []);

  useEffect(() => {
    if (showPgaiModal) {
      fetchVectorTables();
    }
  }, [showPgaiModal]);

  const fetchVectorTables = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v2/embeddings/tables', {
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Extract table names that have vector columns
        const tables = data.tables?.map((t: any) => t.table_name) || [];
        setVectorTables(tables);
      }
    } catch (error) {
      console.error('Failed to fetch vector tables:', error);
      // Fallback to common tables
      setVectorTables(['unified_embeddings', 'document_embeddings', 'message_embeddings']);
    }
  };

  const fetchServicesStatus = async () => {
    try {
      const response = await fetch("/api/v2/integrations/status");
      if (response.ok) {
        const data = await response.json();
        setServices(prev => prev.map(service => {
          const statusData = data[service.name];
          if (statusData) {
            const updates: any = { status: statusData.status };

            // Handle pgai specific fields
            if (service.name === "pgai" && statusData.installed) {
              updates.description = `Automatic embeddings${statusData.processed_count ? ` (Processed: ${statusData.processed_count})` : ''}`;
            }

            // Handle pgvectorscale
            if (service.name === "pgvectorscale" && statusData.status === "running") {
              updates.description = "Performance optimizer (Installed)";
            }

            return { ...service, ...updates };
          }
          return service;
        }));
      }
    } catch (error) {
      console.error("Failed to fetch service status:", error);
    }
  };

  const handleServiceAction = async (serviceName: string, action: "start" | "stop" | "restart") => {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/integrations/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceName, action })
      });

      if (response.ok) {
        toast.success(`Service ${serviceName} ${action}ed successfully`);
        setServices(prev => prev.map(s =>
          s.name === serviceName
            ? { ...s, status: action === "stop" ? "stopped" : "starting" }
            : s
        ));
        setTimeout(fetchServicesStatus, 2000);
      } else {
        throw new Error(`Failed to ${action} service`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} service: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "stopped":
        return <XCircle className="h-4 w-4 text-gray-400" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "starting":
      case "stopping":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-green-500";
      case "stopped":
        return "bg-gray-400";
      case "error":
        return "bg-red-500";
      case "starting":
      case "stopping":
        return "bg-blue-500";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Services</h1>
          <p className="text-muted-foreground mt-1">
            Manage microservices, deployment and developer tools
          </p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Services (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Services Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <Card
              key={service.name}
              className={`relative overflow-hidden transition-all hover:shadow-md cursor-pointer
                ${activeService === service.name ? 'ring-2 ring-primary' : ''}
                backdrop-blur-sm dark:bg-card/80 bg-gray-50/50 border-gray-200/60
              `}
              onClick={() => {
                setActiveService(service.name);
                setShowServiceDialog(true);
              }}
            >
              {/* Status indicator line */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${getStatusColor(service.status)}`} />

              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{service.displayName}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    {service.name === "pgai" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPgaiModal(true);
                        }}
                        title="Configure Workers"
                      >
                        <SettingsIcon className="h-3 w-3" />
                      </Button>
                    )}
                    {getStatusIcon(service.status)}
                  </div>
                </div>
                <CardDescription className="text-xs mt-1">
                  {service.name === "pgai" && service.workerCount
                    ? `${service.workerCount} worker${service.workerCount > 1 ? 's' : ''} running`
                    : service.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                {/* Service Info */}
                <div className="space-y-1.5">
                  {service.port && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Port</span>
                      <span className="font-mono">{service.port}</span>
                    </div>
                  )}
                  {service.version && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Version</span>
                      <span>{service.version}</span>
                    </div>
                  )}
                  {/* Type badge for database extensions */}
                  {["pgai", "pgvectorscale"].includes(service.name) && (
                    <Badge variant="outline" className="text-[10px] mt-1">
                      DB Extension
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })}
          </div>
        </div>

        {/* Right Column - DevOps Tools (1/3) */}
        <div className="space-y-4">
          {/* System Status */}
          <SystemStatusCard />

          {/* DevOps Card */}
          <DevOpsCard />
        </div>
      </div>

      {/* Service Details Dialog */}
      <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {(() => {
                const service = services.find(s => s.name === activeService);
                const Icon = service?.icon || Activity;
                return <Icon className="h-5 w-5" />;
              })()}
              {services.find(s => s.name === activeService)?.displayName}
            </DialogTitle>
            <DialogDescription>
              {services.find(s => s.name === activeService)?.description}
            </DialogDescription>
          </DialogHeader>

          {activeService && (
            <div className="space-y-4">
              {/* Service Status */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  {getStatusIcon(services.find(s => s.name === activeService)?.status || 'unknown')}
                  <span className="text-sm font-medium capitalize">
                    {services.find(s => s.name === activeService)?.status}
                  </span>
                </div>
                {services.find(s => s.name === activeService)?.port && (
                  <span className="text-sm text-muted-foreground">
                    Port: {services.find(s => s.name === activeService)?.port}
                  </span>
                )}
              </div>

              {/* Service-specific Config */}
              {activeService === "graphql" && <GraphQLConfig />}
              {activeService === "python" && <PythonConfig />}
              {activeService === "crawl4ai" && <Crawl4AIConfig />}
              {activeService === "whisper" && <WhisperConfig />}
              {activeService === "pgai" && <PgaiConfig />}
              {activeService === "pgvectorscale" && <PgvectorscaleConfig />}
              {activeService === "n8n" && <N8NConfig />}

              {/* Actions */}
              {!["database", "pgai", "pgvectorscale"].includes(activeService) && (
                <div className="flex gap-2 pt-2">
                  {services.find(s => s.name === activeService)?.status === "stopped" ? (
                    <Button
                      className="flex-1"
                      onClick={() => {
                        handleServiceAction(activeService, "start");
                        setShowServiceDialog(false);
                      }}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Service
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          handleServiceAction(activeService, "restart");
                          setShowServiceDialog(false);
                        }}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Restart
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          handleServiceAction(activeService, "stop");
                          setShowServiceDialog(false);
                        }}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Stop
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* pgai Worker Configuration Modal */}
      <Dialog open={showPgaiModal} onOpenChange={setShowPgaiModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              pgai Worker Configuration
            </DialogTitle>
            <DialogDescription>
              Configure and manage pgai workers for automatic embeddings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Workers List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Active Workers</Label>
                <Button
                  size="sm"
                  onClick={() => {
                    const newWorker = {
                      id: Date.now(),
                      name: `Worker ${pgaiWorkers.length + 1}`,
                      status: 'configuring'
                    };
                    setPgaiWorkers([...pgaiWorkers, newWorker]);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Worker
                </Button>
              </div>

              <ScrollArea className="h-[300px] rounded-md border p-4">
                {pgaiWorkers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Brain className="h-12 w-12 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No workers configured</p>
                    <p className="text-xs mt-1">Click "Add Worker" to create a new worker</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pgaiWorkers.map((worker) => (
                      <Card key={worker.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <Input
                                value={worker.name}
                                onChange={(e) => {
                                  setPgaiWorkers(pgaiWorkers.map(w =>
                                    w.id === worker.id ? { ...w, name: e.target.value } : w
                                  ));
                                }}
                                className="h-8 text-sm font-medium"
                                placeholder="Worker name"
                              />
                              <Badge variant={worker.status === 'running' ? 'default' : 'secondary'}>
                                {worker.status}
                              </Badge>
                            </div>

                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs">Table</Label>
                                  <Select
                                    value={worker.table || 'unified_embeddings'}
                                    onValueChange={(value) => {
                                      setPgaiWorkers(pgaiWorkers.map(w =>
                                        w.id === worker.id ? { ...w, table: value } : w
                                      ));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select table" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {vectorTables.length > 0 ? (
                                        vectorTables.map(table => (
                                          <SelectItem key={table} value={table}>
                                            {table}
                                          </SelectItem>
                                        ))
                                      ) : (
                                        <>
                                          <SelectItem value="unified_embeddings">unified_embeddings</SelectItem>
                                          <SelectItem value="document_embeddings">document_embeddings</SelectItem>
                                          <SelectItem value="message_embeddings">message_embeddings</SelectItem>
                                        </>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Embedding Model</Label>
                                  <Select defaultValue="openai">
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="openai">OpenAI</SelectItem>
                                      <SelectItem value="google">Google AI</SelectItem>
                                      <SelectItem value="deepseek">DeepSeek</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant={worker.status === 'running' ? 'destructive' : 'default'}
                                  className="h-7 text-xs flex-1"
                                  onClick={() => {
                                    setPgaiWorkers(pgaiWorkers.map(w =>
                                      w.id === worker.id
                                        ? { ...w, status: w.status === 'running' ? 'stopped' : 'running' }
                                        : w
                                    ));
                                    // Update service worker count
                                    const runningCount = pgaiWorkers.filter(w =>
                                      w.id === worker.id ? w.status !== 'running' : w.status === 'running'
                                    ).length;
                                    setServices(services.map(s =>
                                      s.name === 'pgai' ? { ...s, workerCount: runningCount } : s
                                    ));
                                  }}
                                >
                                  {worker.status === 'running' ? (
                                    <>
                                      <Square className="h-3 w-3 mr-1" />
                                      Stop
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3 w-3 mr-1" />
                                      Start
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setPgaiWorkers(pgaiWorkers.filter(w => w.id !== worker.id));
                                    // Update service worker count
                                    const runningCount = pgaiWorkers.filter(w =>
                                      w.id !== worker.id && w.status === 'running'
                                    ).length;
                                    setServices(services.map(s =>
                                      s.name === 'pgai' ? { ...s, workerCount: runningCount } : s
                                    ));
                                  }}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="text-sm text-muted-foreground">
                {pgaiWorkers.filter(w => w.status === 'running').length} of {pgaiWorkers.length} workers running
              </div>
              <Button onClick={() => setShowPgaiModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Configuration Components
function GraphQLConfig() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Playground</Label>
          <Switch defaultChecked />
          <p className="text-xs text-muted-foreground">Enable GraphQL Playground UI</p>
        </div>
        <div className="space-y-2">
          <Label>Introspection</Label>
          <Switch defaultChecked />
          <p className="text-xs text-muted-foreground">Allow schema introspection</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Max Query Depth</Label>
        <Input type="number" defaultValue="10" />
      </div>
      <div className="space-y-2">
        <Label>Query Timeout (ms)</Label>
        <Input type="number" defaultValue="30000" />
      </div>
    </div>
  );
}

function PythonConfig() {
  const [microservices, setMicroservices] = useState<any[]>([]);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMicroservicesStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/python/health/services');
      if (!response.ok) throw new Error('Failed to fetch microservices status');
      const data = await response.json();
      setMicroservices(data.microservices || []);
      setSystemInfo(data.system || null);
    } catch (err: any) {
      setError(err.message);
      console.error('Failed to fetch Python microservices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMicroservicesStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMicroservicesStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
      case 'running':
      case 'idle':
        return <Badge className="bg-green-500">Aktif</Badge>;
      case 'degraded':
      case 'partial':
        return <Badge className="bg-yellow-500">Kısmi</Badge>;
      case 'unavailable':
      case 'error':
        return <Badge className="bg-red-500">Hata</Badge>;
      case 'not_configured':
        return <Badge variant="outline">Yapılandırılmadı</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* System Info */}
      {systemInfo && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 bg-muted rounded-lg text-center">
            <div className="text-xs text-muted-foreground">CPU</div>
            <div className="text-lg font-bold">{systemInfo.cpu_percent}%</div>
          </div>
          <div className="p-3 bg-muted rounded-lg text-center">
            <div className="text-xs text-muted-foreground">RAM</div>
            <div className="text-lg font-bold">{systemInfo.memory_percent}%</div>
          </div>
          <div className="p-3 bg-muted rounded-lg text-center">
            <div className="text-xs text-muted-foreground">Disk</div>
            <div className="text-lg font-bold">{systemInfo.disk_percent}%</div>
          </div>
          <div className="p-3 bg-muted rounded-lg text-center">
            <div className="text-xs text-muted-foreground">Memory</div>
            <div className="text-lg font-bold">{systemInfo.memory_used_mb} MB</div>
          </div>
        </div>
      )}

      {/* Microservices List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Label className="text-lg font-semibold">Python Mikroservisleri</Label>
          <Button size="sm" variant="outline" onClick={fetchMicroservicesStatus} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {error && (
          <Alert className="mb-4">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && microservices.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Yükleniyor...
          </div>
        ) : (
          <div className="space-y-3">
            {microservices.map((service, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{service.name}</span>
                      {getStatusBadge(service.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">{service.description}</p>

                    {/* Service Details */}
                    {service.details && (
                      <div className="mt-2 space-y-1">
                        {/* Document Analyzer specific */}
                        {service.name === 'Document Analyzer' && service.details.is_running && (
                          <div className="text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                            <span className="font-medium">İşleniyor: </span>
                            {service.details.stats?.total_processed || 0} döküman
                            {service.details.stats?.total_success > 0 && (
                              <span className="text-green-600 ml-2">
                                ✓ {service.details.stats.total_success} başarılı
                              </span>
                            )}
                            {service.details.stats?.total_errors > 0 && (
                              <span className="text-red-600 ml-2">
                                ✗ {service.details.stats.total_errors} hata
                              </span>
                            )}
                          </div>
                        )}

                        {/* OCR Details */}
                        {service.name === 'OCR Service' && service.details.tesseract && (
                          <div className="text-xs text-muted-foreground">
                            Tesseract: {service.details.tesseract.status === 'available'
                              ? `v${service.details.tesseract.version}`
                              : 'Yüklü değil'}
                            {service.details.google_vision?.status === 'configured' && (
                              <span className="ml-2">| Google Vision: Yapılandırılmış</span>
                            )}
                          </div>
                        )}

                        {/* Embedding Details */}
                        {service.name === 'Embedding Service' && (
                          <div className="text-xs text-muted-foreground">
                            {service.details.openai?.status === 'configured' && (
                              <span>OpenAI ({service.details.openai.model})</span>
                            )}
                            {service.details.google?.status === 'configured' && (
                              <span className="ml-2">| Google ({service.details.google.model})</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Endpoints */}
                    {service.endpoints && service.endpoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {service.endpoints.slice(0, 2).map((endpoint: string, i: number) => (
                          <code key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                            {endpoint}
                          </code>
                        ))}
                        {service.endpoints.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{service.endpoints.length - 2} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Error Message */}
                    {service.error && (
                      <div className="mt-2 text-xs text-red-500">
                        Hata: {service.error.substring(0, 100)}...
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Original Config Options */}
      <div className="border-t pt-4">
        <Label className="text-sm font-medium mb-3 block">Genel Ayarlar</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Workers</Label>
            <Input type="number" defaultValue="4" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Timeout (s)</Label>
            <Input type="number" defaultValue="30" />
          </div>
        </div>
        <div className="space-y-2 mt-3">
          <Label className="text-xs">Log Level</Label>
          <Select defaultValue="info">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function Crawl4AIConfig() {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription className="text-xs">
          LLM model is configured in Settings &gt; API. Crawl4AI uses the selected provider automatically.
        </AlertDescription>
      </Alert>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Max Workers</Label>
          <Input type="number" defaultValue="5" className="h-8" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Timeout (s)</Label>
          <Input type="number" defaultValue="30" className="h-8" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Use Cache</Label>
          <p className="text-[10px] text-muted-foreground">Cache results in Redis</p>
        </div>
        <Switch defaultChecked />
      </div>
    </div>
  );
}

function PgaiConfig() {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          pgai configuration requires database superuser privileges.
          Please configure through PostgreSQL directly.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>Worker Status</Label>
        <Badge variant="outline">Not Running</Badge>
      </div>
      <Button className="w-full" variant="outline">
        <Database className="h-4 w-4 mr-2" />
        Create Vectorizer
      </Button>
    </div>
  );
}

function PgvectorscaleConfig() {
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          pgvectorscale is a PostgreSQL extension. Install with:
          <code className="block mt-2 p-2 bg-muted rounded text-xs">
            CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
          </code>
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>Index Type</Label>
        <Select defaultValue="diskann">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="diskann">DiskANN</SelectItem>
            <SelectItem value="ivfflat">IVFFlat</SelectItem>
            <SelectItem value="hnsw">HNSW</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Test Components
function GraphQLTest() {
  const [query, setQuery] = useState(`query {
  documents(limit: 5) {
    id
    title
    created_at
  }
}`);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>GraphQL Query</Label>
        <textarea
          className="w-full h-32 p-3 rounded-md border bg-background font-mono text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Button className="w-full">
        <Play className="h-4 w-4 mr-2" />
        Execute Query
      </Button>
    </div>
  );
}

function PythonTest() {
  return (
    <div className="space-y-4">
      <Button className="w-full" variant="outline">
        <Activity className="h-4 w-4 mr-2" />
        Check Health Status
      </Button>
      <Button className="w-full" variant="outline">
        <Terminal className="h-4 w-4 mr-2" />
        Test Database Connection
      </Button>
      <Button className="w-full" variant="outline">
        <Database className="h-4 w-4 mr-2" />
        Test Redis Connection
      </Button>
    </div>
  );
}

function Crawl4AITest() {
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Test URL</Label>
        <Input
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Extraction Mode</Label>
        <Select defaultValue="auto">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="llm">LLM</SelectItem>
            <SelectItem value="schema">Schema</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full" disabled={!url}>
        <Globe className="h-4 w-4 mr-2" />
        Test Crawl
      </Button>
    </div>
  );
}

function WhisperConfig() {
  const [mode, setMode] = useState<"api" | "local">("api");

  return (
    <div className="space-y-3">
      {/* Mode Selection */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Mode</Label>
          <Select value={mode} onValueChange={(v: "api" | "local") => setMode(v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[250]">
              <SelectItem value="api">OpenAI API</SelectItem>
              <SelectItem value="local">Self-hosted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {mode === "local" && (
          <div className="space-y-1">
            <Label className="text-xs">Model Size</Label>
            <Select defaultValue="base">
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[250]">
                <SelectItem value="tiny">Tiny (1GB)</SelectItem>
                <SelectItem value="base">Base (1GB)</SelectItem>
                <SelectItem value="small">Small (2GB)</SelectItem>
                <SelectItem value="medium">Medium (5GB)</SelectItem>
                <SelectItem value="large">Large (10GB)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {mode === "api" && (
          <div className="space-y-1">
            <Label className="text-xs">API Model</Label>
            <Input defaultValue="whisper-1" disabled className="h-8 text-xs bg-muted" />
          </div>
        )}
      </div>

      {/* Language & Temperature */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Language</Label>
          <Select defaultValue="tr">
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[250]">
              <SelectItem value="tr">Turkish</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Temperature</Label>
          <Input type="number" defaultValue="0.0" min="0" max="1" step="0.1" className="h-8 text-xs" />
        </div>
      </div>

      {/* Initial Prompt */}
      <div className="space-y-1">
        <Label className="text-xs">Initial Prompt</Label>
        <Textarea
          placeholder="Domain keywords..."
          className="h-14 text-xs resize-none"
        />
      </div>

      {/* Auto-send */}
      <div className="flex items-center justify-between py-1">
        <div>
          <Label className="text-xs">Auto-send</Label>
          <p className="text-[10px] text-muted-foreground">Send to chat</p>
        </div>
        <Switch defaultChecked={false} />
      </div>

      <p className="text-[10px] text-muted-foreground">
        {mode === "api" ? "Uses OpenAI API key ($0.006/min)" : "Free, GPU recommended"}
      </p>
    </div>
  );
}

function N8NConfig() {
  const [n8nUrl, setN8nUrl] = useState("http://localhost:5678");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  // Load settings from backend
  useEffect(() => {
    fetch('/api/settings?category=n8n')
      .then(res => res.json())
      .then(data => {
        if (data.n8n) {
          setN8nUrl(data.n8n.url || "http://localhost:5678");
          setApiKey(data.n8n.apiKey || "");
        }
      })
      .catch(err => console.error('Failed to load n8n settings:', err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'n8n.url': n8nUrl,
          'n8n.apiKey': apiKey
        })
      });

      if (!response.ok) throw new Error('Failed to save settings');

      toast.success('n8n settings saved successfully!');
    } catch (error: any) {
      console.error('Failed to save n8n settings:', error);
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Configure n8n workflow automation server connection. Required for triggering workflows from LSEMB.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="n8n-url">n8n URL</Label>
        <Input
          id="n8n-url"
          type="text"
          value={n8nUrl}
          onChange={(e) => setN8nUrl(e.target.value)}
          placeholder="http://localhost:5678"
        />
        <p className="text-xs text-muted-foreground">
          URL of your n8n instance (e.g., http://localhost:5678 or https://n8n.luwi.dev)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="n8n-api-key">API Key</Label>
        <Input
          id="n8n-api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter n8n API key"
        />
        <p className="text-xs text-muted-foreground">
          Get API key from n8n Settings → API → Create new API key
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Auto-trigger Workflows</Label>
          <Switch defaultChecked />
          <p className="text-xs text-muted-foreground">Automatically trigger workflows on document upload</p>
        </div>
        <div className="space-y-2">
          <Label>Webhook Validation</Label>
          <Switch defaultChecked />
          <p className="text-xs text-muted-foreground">Validate webhook signatures</p>
        </div>
      </div>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Terminal className="h-4 w-4 mr-2" />
            Save Configuration
          </>
        )}
      </Button>
    </div>
  );
}

function WhisperTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string>("");

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Record audio or upload a file to test speech-to-text transcription.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Test Audio File</Label>
        <Input type="file" accept="audio/*" />
        <p className="text-xs text-muted-foreground">
          Supported formats: webm, mp3, wav, m4a, ogg
        </p>
      </div>

      <Button className="w-full" disabled={testing}>
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Transcribing...
          </>
        ) : (
          <>
            <Mic className="h-4 w-4 mr-2" />
            Test Transcription
          </>
        )}
      </Button>

      {result && (
        <div className="p-4 bg-muted rounded-lg">
          <Label className="text-xs text-muted-foreground mb-2 block">Result:</Label>
          <p className="text-sm">{result}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="w-full" size="sm">
          <Activity className="h-3 w-3 mr-2" />
          Check Health
        </Button>
        <Button variant="outline" className="w-full" size="sm">
          <Database className="h-3 w-3 mr-2" />
          Model Info
        </Button>
      </div>
    </div>
  );
}

// System Status Card - shows last deploy time and uptodate status
function SystemStatusCard() {
  const [status, setStatus] = useState<{
    lastDeploy?: string;
    gitStatus?: 'uptodate' | 'behind' | 'ahead' | 'unknown';
    commitHash?: string;
    branch?: string;
    loading: boolean;
  }>({ loading: true });

  const fetchStatus = async () => {
    setStatus(prev => ({ ...prev, loading: true }));
    try {
      const response = await fetch('/api/v2/devops/status');
      if (response.ok) {
        const data = await response.json();
        setStatus({
          lastDeploy: data.lastDeploy,
          gitStatus: data.gitStatus || 'unknown',
          commitHash: data.commitHash,
          branch: data.branch,
          loading: false
        });
      } else {
        setStatus({ loading: false, gitStatus: 'unknown' });
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      setStatus({ loading: false, gitStatus: 'unknown' });
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getGitStatusBadge = () => {
    switch (status.gitStatus) {
      case 'uptodate':
        return <Badge className="bg-green-500 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-1" />Up to date</Badge>;
      case 'behind':
        return <Badge className="bg-yellow-500 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-1" />Behind</Badge>;
      case 'ahead':
        return <Badge className="bg-blue-500 text-[10px]"><GitBranch className="h-2.5 w-2.5 mr-1" />Ahead</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">Unknown</Badge>;
    }
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Server className="h-4 w-4" />
          System Status
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 ml-auto"
            onClick={fetchStatus}
            disabled={status.loading}
          >
            {status.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {/* Git Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Git</span>
          {getGitStatusBadge()}
        </div>

        {/* Last Deploy */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Last Deploy</span>
          <span className="text-xs font-medium">{formatTimeAgo(status.lastDeploy)}</span>
        </div>

        {/* Branch */}
        {status.branch && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Branch</span>
            <span className="text-xs font-mono">{status.branch}</span>
          </div>
        )}

        {/* Commit Hash */}
        {status.commitHash && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Commit</span>
            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{status.commitHash.slice(0, 7)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// DevOps Card - Debug Mode + DevOps Terminal
function DevOpsCard() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Card className="border-gray-200/60 dark:bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            DevOps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {/* Debug Mode Row */}
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted/70 transition-colors">
            <div className="flex items-center gap-2">
              <Bug className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <span className="text-xs font-medium">Debug Mode</span>
                <p className="text-[10px] text-muted-foreground">Browser console logging</p>
              </div>
            </div>
            <DebugSettings />
          </div>

          {/* DevOps Terminal Row - Clickable */}
          <div
            className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
            onClick={() => setShowModal(true)}
          >
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <span className="text-xs font-medium">DevOps Terminal</span>
                <p className="text-[10px] text-muted-foreground">Deploy, Git, PM2, Nginx</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">Open</Badge>
          </div>
        </CardContent>
      </Card>

      {/* DevOps Terminal Modal */}
      <DeploymentModal isOpen={showModal} onOpenChange={setShowModal} />
    </>
  );
}

// Deployment Modal - Full DevOps Console
function DeploymentModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'deploy' | 'logs' | 'metrics'>('deploy');
  const [commandInput, setCommandInput] = useState('');
  const { deploy, deploying } = useSelfDeploy();
  const { restartService } = usePM2Services();
  const { testConfig, reload: reloadNginx } = useNginx();
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addOutput = (line: string, color?: string) => {
    const timestamp = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setOutput(prev => [...prev.slice(-200), `[${timestamp}] ${line}`]);
  };

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const runAction = async (name: string, action: () => Promise<void>) => {
    setIsRunning(true);
    addOutput(`$ ${name}`);
    try {
      await action();
    } catch (e: any) {
      addOutput(`ERROR: ${e.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // === DEPLOY ACTIONS ===
  const handleDeploy = async (type: 'full' | 'frontend' | 'backend' | 'hotfix' | 'python' | 'restart') => {
    await runAction(`deploy --type=${type}`, async () => {
      const result = await deploy(type);
      if (result?.success) {
        addOutput(`Deployment completed in ${result.duration_ms}ms`);
        if (result.git_commit_after) {
          addOutput(`Commit: ${result.git_commit_after.slice(0, 7)}`);
        }
        if (result.logs) {
          result.logs.split('\n').forEach((line: string) => {
            if (line.trim()) addOutput(line);
          });
        }
        addOutput('OK');
      } else {
        addOutput(`FAILED: ${result?.error || 'Unknown error'}`);
      }
    });
  };

  // === SERVER MANAGEMENT ===
  const handlePM2Restart = async (service: 'all' | 'backend' | 'frontend' | 'python') => {
    await runAction(`pm2 restart ${service}`, async () => {
      await restartService(service);
      addOutput('OK');
    });
  };

  const handleNginxTest = async () => {
    await runAction('nginx -t', async () => {
      const result = await testConfig();
      if (result?.valid) {
        addOutput('nginx: configuration file syntax is ok');
        addOutput('nginx: configuration file test is successful');
      } else {
        addOutput(`FAILED: ${result?.output || 'Invalid config'}`);
      }
    });
  };

  const handleNginxReload = async () => {
    await runAction('systemctl reload nginx', async () => {
      await reloadNginx();
      addOutput('OK');
    });
  };

  const handleCacheClean = async () => {
    await runAction('rm -rf .next && npm run build', async () => {
      const response = await fetch('/api/v2/devops/deploy/clear-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (result?.success) {
        addOutput('.next cache cleared');
        addOutput('OK');
      } else {
        addOutput(`FAILED: ${result?.error || 'Unknown error'}`);
      }
    });
  };

  const handleGitPull = async () => {
    await runAction('git pull origin main', async () => {
      const response = await fetch('/api/v2/devops/deploy/git-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const result = await response.json();
      if (result?.success) {
        if (result.output) {
          result.output.split('\n').forEach((line: string) => {
            if (line.trim()) addOutput(line);
          });
        }
        addOutput('OK');
      } else {
        addOutput(`FAILED: ${result?.error || 'Unknown error'}`);
      }
    });
  };

  // === LOG VIEWING ===
  const handleViewSystemLogs = async (limit: number = 50) => {
    await runAction(`system logs --limit=${limit}`, async () => {
      const response = await fetch(`/api/v2/system/logs/recent?limit=${limit}`);
      const result = await response.json();
      if (result?.success && result?.data) {
        addOutput(`--- System Logs (${result.data.length} entries) ---`);
        result.data.slice(0, limit).forEach((log: any) => {
          const time = new Date(log.timestamp).toLocaleTimeString('tr-TR');
          const level = log.level?.toUpperCase() || 'INFO';
          const service = log.service || 'system';
          addOutput(`[${time}] [${level}] [${service}] ${log.message}`);
        });
        addOutput('--- End of logs ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch logs'}`);
      }
    });
  };

  const handleViewPM2Logs = async (service: 'backend' | 'frontend' | 'python', lines: number = 30) => {
    await runAction(`pm2 logs ${service} --lines ${lines}`, async () => {
      const response = await fetch('/api/v2/devops/ssh/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `pm2 logs ${service} --lines ${lines} --nostream 2>&1 | tail -${lines}`
        })
      });
      const result = await response.json();
      if (result?.success && result?.output) {
        addOutput(`--- PM2 ${service} Logs ---`);
        result.output.split('\n').forEach((line: string) => {
          if (line.trim()) addOutput(line);
        });
        addOutput('--- End of logs ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch logs'}`);
      }
    });
  };

  const handleViewErrorLogs = async () => {
    await runAction('error logs --level=error', async () => {
      const response = await fetch('/api/v2/system/logs/recent?limit=50&level=error');
      const result = await response.json();
      if (result?.success && result?.data) {
        addOutput(`--- Error Logs (${result.data.length} entries) ---`);
        result.data.forEach((log: any) => {
          const time = new Date(log.timestamp).toLocaleTimeString('tr-TR');
          addOutput(`[${time}] [${log.service}] ${log.message}`);
        });
        if (result.data.length === 0) {
          addOutput('No errors found.');
        }
        addOutput('--- End of logs ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch logs'}`);
      }
    });
  };

  // === SYSTEM METRICS ===
  const handleSystemMetrics = async () => {
    await runAction('system metrics', async () => {
      const response = await fetch('/api/v2/devops/self/metrics');
      const result = await response.json();
      if (result?.success && result?.metrics) {
        const m = result.metrics;
        addOutput('--- System Metrics ---');
        addOutput(`CPU Usage:    ${m.cpu || 'N/A'}`);
        addOutput(`Memory:       ${m.ram || 'N/A'}`);
        addOutput(`Disk Usage:   ${m.disk || 'N/A'}`);
        addOutput(`Load Average: ${m.load || 'N/A'}`);
        addOutput(`Uptime:       ${m.uptime || 'N/A'}`);
        addOutput('--- End ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch metrics'}`);
      }
    });
  };

  const handlePM2Status = async () => {
    await runAction('pm2 list', async () => {
      const response = await fetch('/api/v2/devops/self/pm2/status');
      const result = await response.json();
      if (result?.success && result?.services) {
        addOutput('--- PM2 Service Status ---');
        result.services.forEach((svc: any) => {
          const status = svc.status === 'online' ? '✓' : '✗';
          const memory = svc.memory ? `${Math.round(svc.memory / 1024 / 1024)}MB` : 'N/A';
          const cpu = svc.cpu !== undefined ? `${svc.cpu}%` : 'N/A';
          addOutput(`${status} ${svc.name.padEnd(20)} | CPU: ${cpu.padStart(5)} | MEM: ${memory.padStart(7)} | Restarts: ${svc.restarts || 0}`);
        });
        addOutput('--- End ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch PM2 status'}`);
      }
    });
  };

  const handleGitStatus = async () => {
    await runAction('git status', async () => {
      const response = await fetch('/api/v2/devops/status');
      const result = await response.json();
      if (result?.success !== false) {
        addOutput('--- Git Status ---');
        addOutput(`Branch:     ${result.branch || 'unknown'}`);
        addOutput(`Commit:     ${result.commitHash?.slice(0, 7) || 'unknown'}`);
        addOutput(`Status:     ${result.gitStatus || 'unknown'}`);
        addOutput(`Last Deploy: ${result.lastDeploy ? new Date(result.lastDeploy).toLocaleString('tr-TR') : 'N/A'}`);
        addOutput('--- End ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch git status'}`);
      }
    });
  };

  const handleLogStats = async () => {
    await runAction('log stats', async () => {
      const response = await fetch('/api/v2/system/logs/stats');
      const result = await response.json();
      if (result?.success && result?.data) {
        const d = result.data;
        addOutput('--- Log Statistics ---');
        addOutput(`Total Logs: ${d.total || 0}`);
        addOutput(`Errors:     ${d.byLevel?.error || 0}`);
        addOutput(`Warnings:   ${d.byLevel?.warn || 0}`);
        addOutput(`Info:       ${d.byLevel?.info || 0}`);
        addOutput(`Debug:      ${d.byLevel?.debug || 0}`);
        addOutput('--- End ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch stats'}`);
      }
    });
  };

  const handleDeployHistory = async () => {
    await runAction('deploy history', async () => {
      const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'lsemb';
      const response = await fetch(`/api/v2/devops/deployments/${tenantId}?limit=10`);
      const result = await response.json();
      if (result?.deployments) {
        addOutput('--- Deployment History ---');
        result.deployments.slice(0, 10).forEach((dep: any) => {
          const time = new Date(dep.started_at || dep.completed_at).toLocaleString('tr-TR');
          const status = dep.status === 'success' ? '✓' : '✗';
          const duration = dep.duration_ms ? `${dep.duration_ms}ms` : 'N/A';
          addOutput(`${status} [${time}] ${dep.deploy_type || 'full'} - ${duration}`);
        });
        if (result.deployments.length === 0) {
          addOutput('No deployment history found.');
        }
        addOutput('--- End ---');
      } else {
        addOutput(`FAILED: ${result?.error || 'Could not fetch history'}`);
      }
    });
  };

  // Handle command input
  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || isRunning) return;

    const cmd = commandInput.trim().toLowerCase();
    setCommandInput('');

    // Parse and execute command
    if (cmd === 'help') {
      addOutput('$ help');
      addOutput('Available commands:');
      addOutput('  deploy [full|frontend|backend|python|hotfix] - Deploy application');
      addOutput('  pm2 restart [all|backend|frontend|python] - Restart PM2 services');
      addOutput('  pm2 status - Show PM2 service status');
      addOutput('  nginx test - Test nginx configuration');
      addOutput('  nginx reload - Reload nginx');
      addOutput('  git pull - Pull latest changes');
      addOutput('  git status - Show git status');
      addOutput('  logs [system|backend|frontend|python] - View logs');
      addOutput('  metrics - Show system metrics');
      addOutput('  clear - Clear terminal');
      addOutput('  help - Show this help');
    } else if (cmd === 'clear') {
      setOutput([]);
    } else if (cmd.startsWith('deploy')) {
      const type = cmd.split(' ')[1] || 'full';
      handleDeploy(type as any);
    } else if (cmd.startsWith('pm2 restart')) {
      const service = cmd.split(' ')[2] || 'all';
      handlePM2Restart(service as any);
    } else if (cmd === 'pm2 status') {
      handlePM2Status();
    } else if (cmd === 'nginx test') {
      handleNginxTest();
    } else if (cmd === 'nginx reload') {
      handleNginxReload();
    } else if (cmd === 'git pull') {
      handleGitPull();
    } else if (cmd === 'git status') {
      handleGitStatus();
    } else if (cmd.startsWith('logs')) {
      const type = cmd.split(' ')[1] || 'system';
      if (type === 'system') handleViewSystemLogs(50);
      else if (type === 'backend') handleViewPM2Logs('backend', 30);
      else if (type === 'frontend') handleViewPM2Logs('frontend', 30);
      else if (type === 'python') handleViewPM2Logs('python', 30);
      else handleViewSystemLogs(50);
    } else if (cmd === 'metrics') {
      handleSystemMetrics();
    } else {
      addOutput(`$ ${cmd}`);
      addOutput(`Command not found: ${cmd}. Type 'help' for available commands.`);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
        {/* Header with tabs - fixed layout */}
        <div className="px-4 py-2 border-b bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Title */}
            <div className="flex items-center gap-2 min-w-0">
              <Terminal className="h-4 w-4 flex-shrink-0" />
              <span className="font-semibold text-sm">DevOps Console</span>
              {(isRunning || deploying) && (
                <Badge className="bg-green-500 text-[10px] flex-shrink-0">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  Running
                </Badge>
              )}
            </div>

            {/* Tabs - centered */}
            <div className="flex gap-1 flex-1 justify-center">
              <Button
                size="sm"
                variant={activeTab === 'deploy' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('deploy')}
                className="h-7 text-xs px-3"
              >
                <Rocket className="h-3 w-3 mr-1" />
                Deploy
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'logs' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('logs')}
                className="h-7 text-xs px-3"
              >
                <Terminal className="h-3 w-3 mr-1" />
                Logs
              </Button>
              <Button
                size="sm"
                variant={activeTab === 'metrics' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('metrics')}
                className="h-7 text-xs px-3"
              >
                <Activity className="h-3 w-3 mr-1" />
                Metrics
              </Button>
            </div>

            {/* Close button - right side, separate from dialog's default */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 p-0 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Terminal Output - Main Body */}
        <div
          ref={outputRef}
          className="flex-1 bg-[#1a1a1a] p-3 overflow-y-auto font-mono text-xs leading-relaxed"
        >
          {output.length === 0 ? (
            <div className="text-gray-500">
              <p># DevOps Console Ready</p>
              <p># Use tabs above to switch between Deploy, Logs, and Metrics</p>
              <p># Select an action from the buttons below</p>
              <p>&nbsp;</p>
            </div>
          ) : (
            output.map((line, i) => (
              <div
                key={i}
                className={`${
                  line.includes('$') ? 'text-cyan-400 font-semibold mt-2' :
                  line.includes('OK') || line.includes('✓') ? 'text-green-400' :
                  line.includes('FAILED') || line.includes('ERROR') || line.includes('✗') ? 'text-red-400' :
                  line.includes('---') ? 'text-blue-400 font-semibold' :
                  line.includes('Commit:') || line.includes('completed') ? 'text-yellow-400' :
                  line.includes('[WARN]') || line.includes('warn') ? 'text-yellow-400' :
                  line.includes('[ERROR]') || line.includes('error') ? 'text-red-400' :
                  line.includes('[INFO]') || line.includes('info') ? 'text-blue-300' :
                  'text-gray-300'
                }`}
              >
                {line}
              </div>
            ))
          )}
          {(isRunning || deploying) && (
            <div className="flex items-center gap-2 text-gray-400 mt-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Processing...</span>
            </div>
          )}
        </div>

        {/* Command Input - Prompt Bar */}
        <div className="border-t bg-[#1a1a1a] px-3 py-2 flex-shrink-0">
          <form onSubmit={handleCommandSubmit} className="flex items-center gap-2">
            <span className="text-cyan-400 font-mono text-sm">$</span>
            <Input
              ref={inputRef}
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder="Type a command... (help for list)"
              disabled={isRunning || deploying}
              className="flex-1 h-8 bg-transparent border-none text-gray-200 font-mono text-sm placeholder:text-gray-600 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="submit"
              size="sm"
              disabled={isRunning || deploying || !commandInput.trim()}
              className="h-7 text-xs"
            >
              Run
            </Button>
          </form>
        </div>

        {/* Action Buttons - Footer - Single row with scroll */}
        <div className="border-t bg-muted/30 px-2 py-1.5 flex-shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {activeTab === 'deploy' && (
              <>
                {/* Deploy Actions - Primary */}
                <Button size="sm" onClick={() => handleDeploy('full')} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Full deployment: git pull + build + restart all">
                  <Rocket className="h-3 w-3 mr-1" />
                  Full Deploy
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDeploy('frontend')} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Build and restart frontend only">
                  <Globe className="h-3 w-3 mr-1" />
                  Frontend
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDeploy('backend')} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Restart backend only">
                  <Server className="h-3 w-3 mr-1" />
                  Backend
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDeploy('python')} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Restart Python services">
                  <Code className="h-3 w-3 mr-1" />
                  Python
                </Button>
                <div className="w-px h-5 bg-border mx-1" />
                {/* Server Management - Secondary */}
                <Button size="sm" variant="secondary" onClick={handleGitPull} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Pull latest from git">
                  <Download className="h-3 w-3 mr-1" />
                  Pull
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handlePM2Restart('all')} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Restart all PM2 services">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  PM2
                </Button>
                <Button size="sm" variant="secondary" onClick={handleCacheClean} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Clear .next cache">
                  <Trash2 className="h-3 w-3 mr-1" />
                  Cache
                </Button>
                <Button size="sm" variant="secondary" onClick={handleNginxTest} disabled={isRunning || deploying} className="h-7 text-xs whitespace-nowrap" title="Test nginx config">
                  <Shield className="h-3 w-3 mr-1" />
                  Nginx
                </Button>
              </>
            )}

            {activeTab === 'logs' && (
              <>
                <Button size="sm" onClick={() => handleViewSystemLogs(50)} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View system logs">
                  <Terminal className="h-3 w-3 mr-1" />
                  System
                </Button>
                <Button size="sm" variant="outline" onClick={handleViewErrorLogs} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View error logs only">
                  <XCircle className="h-3 w-3 mr-1" />
                  Errors
                </Button>
                <div className="w-px h-5 bg-border mx-1" />
                <Button size="sm" variant="secondary" onClick={() => handleViewPM2Logs('backend', 30)} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View backend PM2 logs">
                  <Server className="h-3 w-3 mr-1" />
                  Backend
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleViewPM2Logs('frontend', 30)} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View frontend PM2 logs">
                  <Globe className="h-3 w-3 mr-1" />
                  Frontend
                </Button>
                <Button size="sm" variant="secondary" onClick={() => handleViewPM2Logs('python', 30)} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View Python PM2 logs">
                  <Code className="h-3 w-3 mr-1" />
                  Python
                </Button>
              </>
            )}

            {activeTab === 'metrics' && (
              <>
                <Button size="sm" onClick={handleSystemMetrics} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View CPU, RAM, Disk usage">
                  <Activity className="h-3 w-3 mr-1" />
                  System
                </Button>
                <Button size="sm" variant="outline" onClick={handlePM2Status} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View PM2 service status">
                  <Server className="h-3 w-3 mr-1" />
                  PM2
                </Button>
                <Button size="sm" variant="outline" onClick={handleGitStatus} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View git status">
                  <GitBranch className="h-3 w-3 mr-1" />
                  Git
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeployHistory} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View deployment history">
                  <Rocket className="h-3 w-3 mr-1" />
                  History
                </Button>
                <Button size="sm" variant="outline" onClick={handleLogStats} disabled={isRunning} className="h-7 text-xs whitespace-nowrap" title="View log statistics">
                  <Activity className="h-3 w-3 mr-1" />
                  Stats
                </Button>
              </>
            )}

            {/* Clear button - always visible */}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setOutput([])} className="h-7 text-xs whitespace-nowrap">
              Clear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}