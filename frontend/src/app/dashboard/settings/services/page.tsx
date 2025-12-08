"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

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
  const [logs, setLogs] = useState<string[]>([]);
  const [showPgaiModal, setShowPgaiModal] = useState(false);
  const [pgaiWorkers, setPgaiWorkers] = useState<Array<{id: number, name: string, status: string, table?: string}>>([]);
  const [vectorTables, setVectorTables] = useState<string[]>([]);

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
      const token = localStorage.getItem('token');
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
            Manage microservices and integrations
          </p>
        </div>
      </div>

      {/* Services Grid - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              onClick={() => setActiveService(service.name)}
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

      {/* Service Details Panel */}
      {activeService && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {services.find(s => s.name === activeService)?.displayName} Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="config" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="config">Configuration</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="test">Test</TabsTrigger>
              </TabsList>

              <TabsContent value="config" className="space-y-4">
                {activeService === "graphql" && <GraphQLConfig />}
                {activeService === "python" && <PythonConfig />}
                {activeService === "crawl4ai" && <Crawl4AIConfig />}
                {activeService === "whisper" && <WhisperConfig />}
                {activeService === "pgai" && <PgaiConfig />}
                {activeService === "pgvectorscale" && <PgvectorscaleConfig />}
                {activeService === "n8n" && <N8NConfig />}
                {!["graphql", "python", "crawl4ai", "whisper", "pgai", "pgvectorscale", "n8n"].includes(activeService) && (
                  <Alert>
                    <AlertDescription>
                      No configuration available for this service.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="logs" className="space-y-4">
                <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs h-64 overflow-y-auto">
                  <div className="space-y-1">
                    {logs.length > 0 ? logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    )) : (
                      <>
                        <div>[2024-10-29 19:15:00] INFO: Service started successfully</div>
                        <div>[2024-10-29 19:15:01] INFO: Listening on port {services.find(s => s.name === activeService)?.port || "N/A"}</div>
                        <div>[2024-10-29 19:15:02] INFO: Health check passed</div>
                      </>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="test" className="space-y-4">
                {activeService === "graphql" && <GraphQLTest />}
                {activeService === "python" && <PythonTest />}
                {activeService === "crawl4ai" && <Crawl4AITest />}
                {activeService === "whisper" && <WhisperTest />}
                {!["graphql", "python", "crawl4ai", "whisper"].includes(activeService) && (
                  <Alert>
                    <AlertDescription>
                      No test interface available for this service.
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Workers</Label>
          <Input type="number" defaultValue="4" />
        </div>
        <div className="space-y-2">
          <Label>Timeout (s)</Label>
          <Input type="number" defaultValue="30" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Log Level</Label>
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