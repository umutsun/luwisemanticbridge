"use client";

import { useState, useEffect, useMemo } from "react";
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
  Bug
} from "lucide-react";
import { toast } from "sonner";
import { usePM2Services, useNginx, useSelfDeploy } from "@/hooks/useDevOps";
import { DebugSettings } from "@/components/settings/DebugSettings";

// Dynamic import for ConsoleModal
const ConsoleModal = dynamic(() => import("@/components/dashboard/ConsoleModal"), {
  ssr: false,
  loading: () => null
});

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
  const [consoleOpen, setConsoleOpen] = useState(false);

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
              className={`relative overflow-hidden transition-all hover:shadow-md cursor-pointer flex flex-col
                ${activeService === service.name ? 'ring-2 ring-primary' : ''}
                backdrop-blur-sm
                dark:bg-card/80
                bg-gray-50/50 border-gray-200/60
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

              <CardContent className="flex flex-col flex-1">
                {/* Service Info - grows to push buttons to bottom */}
                <div className="space-y-2 flex-1">
                  {service.port && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Port</span>
                      <span className="font-mono">{service.port}</span>
                    </div>
                  )}

                  {service.version && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Version</span>
                      <span className="text-xs">{service.version}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons - always at bottom */}
                <div className="flex gap-2 pt-3 mt-auto">
                  {/* Database extensions cannot be managed like services */}
                  {["pgai", "pgvectorscale"].includes(service.name) ? (
                    <div className="flex-1 text-center">
                      <Badge variant="outline" className="text-xs">
                        Database Extension
                      </Badge>
                    </div>
                  ) : service.status === "stopped" ? (
                    <Button
                      size="sm"
                      className="flex-1 h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleServiceAction(service.name, "start");
                      }}
                      disabled={loading || ["database", "nodejs", "python", "crawl4ai", "graphql", "pgvectorscale"].includes(service.name)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleServiceAction(service.name, "stop");
                        }}
                        disabled={loading || ["database", "nodejs", "python", "crawl4ai", "graphql", "pgvectorscale"].includes(service.name)}
                      >
                        <Square className="h-3 w-3 mr-1" />
                        Stop
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleServiceAction(service.name, "restart");
                        }}
                        disabled={loading || ["database", "nodejs", "python", "crawl4ai", "graphql", "pgvectorscale"].includes(service.name)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Restart
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })}
          </div>

          {/* Deployment - Compact */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Deployment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Deploy Actions - Compact 2x2 grid */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      toast.info('Starting full deploy...');
                      const result = await deploy('full');
                      result?.success ? toast.success('Full deploy completed!') : toast.error(result?.error || 'Deploy failed');
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  disabled={deploying}
                  className="h-8 text-xs"
                >
                  {deploying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Rocket className="h-3 w-3 mr-1" />}
                  Full Deploy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      toast.info('Hot fix deploying...');
                      const result = await deploy('hotfix');
                      result?.success ? toast.success('Hot fix completed!') : toast.error(result?.error || 'Deploy failed');
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  disabled={deploying}
                  className="h-8 text-xs"
                >
                  <GitBranch className="h-3 w-3 mr-1" />
                  Hot Fix
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      toast.info('Building frontend...');
                      const result = await deploy('frontend');
                      result?.success ? toast.success('Frontend rebuilt!') : toast.error(result?.error || 'Build failed');
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  disabled={deploying}
                  className="h-8 text-xs"
                >
                  <Globe className="h-3 w-3 mr-1" />
                  Frontend
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      toast.info('Restarting backend...');
                      const result = await deploy('backend');
                      result?.success ? toast.success('Backend restarted!') : toast.error(result?.error || 'Restart failed');
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  disabled={deploying}
                  className="h-8 text-xs"
                >
                  <Server className="h-3 w-3 mr-1" />
                  Backend
                </Button>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-1 pt-2 border-t">
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={async () => { try { await restartService('all'); toast.success('All restarted'); } catch (e: any) { toast.error(e.message); } }}>
                  <RefreshCw className="h-3 w-3 mr-1" />PM2 All
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={async () => { try { const r = await testConfig(); r?.valid ? toast.success('Valid') : toast.error('Invalid'); } catch (e: any) { toast.error(e.message); } }} disabled={nginxLoading}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />Nginx Test
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={async () => { try { await reloadNginx(); toast.success('Reloaded'); } catch (e: any) { toast.error(e.message); } }} disabled={nginxLoading}>
                  <Globe className="h-3 w-3 mr-1" />Nginx Reload
                </Button>
              </div>

              {/* PM2 Status Badges */}
              {pm2Services.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pm2Services.map((svc) => (
                    <Badge
                      key={svc.name}
                      variant="outline"
                      className={`text-[10px] cursor-pointer ${svc.status === 'online' ? 'border-green-500/50 text-green-600' : 'border-red-500/50 text-red-600'}`}
                      onClick={() => { restartService(svc.name.includes('backend') ? 'backend' : svc.name.includes('frontend') ? 'frontend' : 'python'); toast.info(`Restarting ${svc.name}...`); }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full mr-1 ${svc.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                      {svc.name.replace('-backend', '-be').replace('-frontend', '-fe').replace('-python', '-py')}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Developer Tools (1/3) */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bug className="h-4 w-4" />
                Developer Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Debug Mode */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">Debug Mode</Label>
                  <p className="text-[10px] text-muted-foreground">Browser console logging</p>
                </div>
                <DebugSettings />
              </div>

              {/* Console Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConsoleOpen(true)}
                className="w-full h-8 text-xs"
              >
                <Terminal className="h-3 w-3 mr-2" />
                Open Console
              </Button>
            </CardContent>
          </Card>

          {/* PM2 Quick Status */}
          {pm2Services.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Activity className="h-3 w-3" />
                  PM2 Status
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => loadPM2()} disabled={pm2Loading}>
                    {pm2Loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {pm2Services.map((svc) => (
                    <div key={svc.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${svc.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="truncate max-w-[100px]">{svc.name}</span>
                      </div>
                      <span className="text-muted-foreground">{svc.cpu}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Console Modal */}
      <ConsoleModal isOpen={consoleOpen} onOpenChange={setConsoleOpen} />

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
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Model</Label>
          <Select defaultValue="gpt-4">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4">GPT-4</SelectItem>
              <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              <SelectItem value="claude-3">Claude 3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select defaultValue="openai">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="local">Local LLM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Workers</Label>
          <Input type="number" defaultValue="5" />
        </div>
        <div className="space-y-2">
          <Label>Timeout (s)</Label>
          <Input type="number" defaultValue="30" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Use Cache</Label>
        <Switch defaultChecked />
        <p className="text-xs text-muted-foreground">Cache scraping results in Redis</p>
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
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Whisper supports both OpenAI API (paid) and self-hosted (free) modes.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Mode</Label>
        <Select value={mode} onValueChange={(v: "api" | "local") => setMode(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="api">OpenAI API (Recommended)</SelectItem>
            <SelectItem value="local">Self-hosted (Free, GPU recommended)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mode === "api" ? "Uses OpenAI API key from settings ($0.006/minute)" : "Runs locally on your server (free)"}
        </p>
      </div>

      {mode === "api" && (
        <div className="space-y-2">
          <Label>Model</Label>
          <Select defaultValue="whisper-1">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whisper-1">whisper-1 (Latest)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === "local" && (
        <div className="space-y-2">
          <Label>Model Size</Label>
          <Select defaultValue="base">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiny">Tiny (~1GB RAM, fastest)</SelectItem>
              <SelectItem value="base">Base (~1GB RAM, recommended)</SelectItem>
              <SelectItem value="small">Small (~2GB RAM, more accurate)</SelectItem>
              <SelectItem value="medium">Medium (~5GB RAM, high accuracy)</SelectItem>
              <SelectItem value="large">Large (~10GB RAM, best)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Language</Label>
          <Select defaultValue="tr">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tr">Turkish</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="auto">Auto-detect</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Temperature</Label>
          <Input type="number" defaultValue="0.0" min="0" max="1" step="0.1" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Initial Prompt (Optional)</Label>
        <Textarea
          placeholder="Vergi, muhasebe ve hukuk terimleri içerir..."
          className="h-20 text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Helps improve accuracy for domain-specific terminology
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Auto-send transcription</Label>
          <Switch defaultChecked={false} />
        </div>
        <p className="text-xs text-muted-foreground">
          Automatically send transcribed text to chat
        </p>
      </div>

      <Button className="w-full">
        <Terminal className="h-4 w-4 mr-2" />
        Save Configuration
      </Button>
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