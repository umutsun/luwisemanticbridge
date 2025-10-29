"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Play,
  Square,
  RefreshCw,
  Settings,
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  FileText,
  Brain,
  Database,
  Zap,
  Globe,
  Code,
  Info
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
  features?: string[];
  configurable?: boolean;
  icon?: any;
}

interface IntegrationConfig {
  crawl4ai: {
    enabled: boolean;
    model: string;
    provider: string;
    maxWorkers: number;
    timeout: number;
    useCache: boolean;
  };
  pgai: {
    enabled: boolean;
    installed: boolean;
    vectorizers: any[];
    workerStatus: string;
  };
  pgvectorscale: {
    installed: boolean;
    enabled: boolean;
    indexType: string;
  };
}

export default function IntegrationsPage() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("services");
  const [config, setConfig] = useState<IntegrationConfig>({
    crawl4ai: {
      enabled: false,
      model: "gpt-4",
      provider: "openai",
      maxWorkers: 5,
      timeout: 30,
      useCache: true
    },
    pgai: {
      enabled: false,
      installed: false,
      vectorizers: [],
      workerStatus: "not_running"
    },
    pgvectorscale: {
      installed: false,
      enabled: false,
      indexType: "diskann"
    }
  });

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchServices = async () => {
    try {
      // Check Python service
      const pythonHealth = await checkPythonService();

      // Check other integrations
      const integrationStatus = await checkIntegrations();

      const serviceList: ServiceStatus[] = [
        {
          name: "python-services",
          displayName: "Python Microservices",
          description: "FastAPI service for AI-powered features",
          status: pythonHealth.status,
          health: pythonHealth.health,
          port: 8001,
          url: "http://localhost:8001",
          version: "1.0.0",
          features: ["Crawl4AI", "pgai", "Health Monitoring"],
          configurable: true,
          icon: Code
        },
        {
          name: "crawl4ai",
          displayName: "Crawl4AI",
          description: "AI-powered web scraping with LLM extraction",
          status: integrationStatus.crawl4ai ? "running" : "stopped",
          features: ["LLM Extraction", "Auto Mode", "Batch Processing", "Schema Validation"],
          configurable: true,
          icon: Brain
        },
        {
          name: "pgai",
          displayName: "pgai",
          description: "Automatic embedding management for PostgreSQL",
          status: integrationStatus.pgai ? "running" : "stopped",
          features: ["Auto Embeddings", "Vectorizer Pipelines", "Background Processing"],
          configurable: true,
          icon: Database
        },
        {
          name: "pgvectorscale",
          displayName: "pgvectorscale",
          description: "High-performance vector search optimization",
          status: integrationStatus.pgvectorscale ? "running" : "stopped",
          features: ["28x Faster Search", "DiskANN Index", "Cost Optimization"],
          configurable: false,
          icon: Zap
        },
        {
          name: "nodejs-scraper",
          displayName: "Node.js Scraper",
          description: "Built-in Puppeteer/Cheerio scraping",
          status: "running",
          features: ["Static Scraping", "Dynamic Content", "Sitemap Support"],
          icon: Globe
        }
      ];

      setServices(serviceList);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch services:", error);
      setLoading(false);
    }
  };

  const checkPythonService = async () => {
    try {
      const response = await fetch("http://localhost:8001/health");
      if (response.ok) {
        const data = await response.json();
        return {
          status: "running" as const,
          health: {
            status: data.status,
            lastCheck: new Date().toISOString(),
            details: data
          }
        };
      }
    } catch (error) {
      // Service not reachable
    }
    return { status: "stopped" as const, health: null };
  };

  const checkIntegrations = async () => {
    try {
      const response = await fetch("/api/v2/integrations/status");
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("Failed to check integrations:", error);
    }
    return {
      crawl4ai: false,
      pgai: false,
      pgvectorscale: false
    };
  };

  const handleServiceAction = async (serviceName: string, action: "start" | "stop" | "restart") => {
    const service = services.find(s => s.name === serviceName);
    if (!service) return;

    // Update UI to show pending state
    setServices(prev => prev.map(s =>
      s.name === serviceName
        ? { ...s, status: action === "stop" ? "stopping" : "starting" }
        : s
    ));

    try {
      const response = await fetch("/api/v2/integrations/service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceName, action })
      });

      if (response.ok) {
        toast.success(`${service.displayName} ${action}ed successfully`);
        setTimeout(fetchServices, 2000); // Refresh after 2 seconds
      } else {
        throw new Error(`Failed to ${action} service`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} ${service.displayName}`);
      fetchServices(); // Refresh to get actual state
    }
  };

  const saveConfiguration = async (integration: string) => {
    try {
      const response = await fetch("/api/v2/integrations/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integration,
          config: config[integration as keyof IntegrationConfig]
        })
      });

      if (response.ok) {
        toast.success(`${integration} configuration saved`);
      } else {
        throw new Error("Failed to save configuration");
      }
    } catch (error) {
      toast.error(`Failed to save ${integration} configuration`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "stopped":
        return <XCircle className="h-5 w-5 text-gray-400" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "starting":
      case "stopping":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      running: "default",
      stopped: "secondary",
      error: "destructive",
      starting: "outline",
      stopping: "outline"
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Integrations & Services</h1>
          <p className="text-muted-foreground mt-2">
            Manage Python services and AI integrations
          </p>
        </div>
        <Button onClick={fetchServices} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="crawl4ai">Crawl4AI</TabsTrigger>
          <TabsTrigger value="pgai">pgai</TabsTrigger>
          <TabsTrigger value="pgvectorscale">pgvectorscale</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          <div className="grid gap-4">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <Card key={service.name}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {Icon && <Icon className="h-6 w-6 text-muted-foreground" />}
                        <div>
                          <CardTitle className="text-lg">{service.displayName}</CardTitle>
                          <CardDescription>{service.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        {getStatusIcon(service.status)}
                        {getStatusBadge(service.status)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {service.features && (
                        <div className="flex flex-wrap gap-2">
                          {service.features.map((feature) => (
                            <Badge key={feature} variant="outline">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground space-y-1">
                          {service.port && (
                            <p>Port: {service.port}</p>
                          )}
                          {service.url && (
                            <p>
                              URL: <a href={service.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                {service.url}
                              </a>
                            </p>
                          )}
                          {service.version && (
                            <p>Version: {service.version}</p>
                          )}
                        </div>

                        <div className="flex space-x-2">
                          {service.name === "python-services" && (
                            <>
                              {service.status === "stopped" ? (
                                <Button
                                  size="sm"
                                  onClick={() => handleServiceAction(service.name, "start")}
                                  disabled={service.status === "starting"}
                                >
                                  <Play className="h-4 w-4 mr-1" />
                                  Start
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleServiceAction(service.name, "stop")}
                                  disabled={service.status === "stopping"}
                                >
                                  <Square className="h-4 w-4 mr-1" />
                                  Stop
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleServiceAction(service.name, "restart")}
                                disabled={service.status === "starting" || service.status === "stopping"}
                              >
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Restart
                              </Button>
                            </>
                          )}
                          {service.configurable && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setActiveTab(service.name.replace("-services", ""))}
                            >
                              <Settings className="h-4 w-4 mr-1" />
                              Configure
                            </Button>
                          )}
                        </div>
                      </div>

                      {service.health && service.status === "running" && (
                        <Alert>
                          <Activity className="h-4 w-4" />
                          <AlertTitle>Health Status</AlertTitle>
                          <AlertDescription>
                            Status: {service.health.status} | Last Check: {new Date(service.health.lastCheck).toLocaleTimeString()}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="crawl4ai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Crawl4AI Configuration</CardTitle>
              <CardDescription>
                Configure AI-powered web scraping settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="crawl4ai-enabled"
                  checked={config.crawl4ai.enabled}
                  onCheckedChange={(checked) =>
                    setConfig(prev => ({
                      ...prev,
                      crawl4ai: { ...prev.crawl4ai, enabled: checked }
                    }))
                  }
                />
                <Label htmlFor="crawl4ai-enabled">Enable Crawl4AI</Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="model">LLM Model</Label>
                  <Input
                    id="model"
                    value={config.crawl4ai.model}
                    onChange={(e) =>
                      setConfig(prev => ({
                        ...prev,
                        crawl4ai: { ...prev.crawl4ai, model: e.target.value }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Input
                    id="provider"
                    value={config.crawl4ai.provider}
                    onChange={(e) =>
                      setConfig(prev => ({
                        ...prev,
                        crawl4ai: { ...prev.crawl4ai, provider: e.target.value }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-workers">Max Workers</Label>
                  <Input
                    id="max-workers"
                    type="number"
                    value={config.crawl4ai.maxWorkers}
                    onChange={(e) =>
                      setConfig(prev => ({
                        ...prev,
                        crawl4ai: { ...prev.crawl4ai, maxWorkers: parseInt(e.target.value) }
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeout">Timeout (seconds)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={config.crawl4ai.timeout}
                    onChange={(e) =>
                      setConfig(prev => ({
                        ...prev,
                        crawl4ai: { ...prev.crawl4ai, timeout: parseInt(e.target.value) }
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="use-cache"
                  checked={config.crawl4ai.useCache}
                  onCheckedChange={(checked) =>
                    setConfig(prev => ({
                      ...prev,
                      crawl4ai: { ...prev.crawl4ai, useCache: checked }
                    }))
                  }
                />
                <Label htmlFor="use-cache">Enable Caching</Label>
              </div>

              <Button onClick={() => saveConfiguration("crawl4ai")}>
                Save Configuration
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Crawl4AI</CardTitle>
              <CardDescription>
                Test the AI-powered scraping functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-url">URL to Scrape</Label>
                <Input
                  id="test-url"
                  placeholder="https://example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extraction-prompt">Extraction Prompt (Optional)</Label>
                <Textarea
                  id="extraction-prompt"
                  placeholder="Extract the main article title and content..."
                  rows={3}
                />
              </div>

              <Button>
                <Brain className="h-4 w-4 mr-2" />
                Test Scraping
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pgai" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>pgai Configuration</CardTitle>
              <CardDescription>
                Automatic embedding management for PostgreSQL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!config.pgai.installed ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>pgai Not Installed</AlertTitle>
                  <AlertDescription>
                    pgai needs to be installed in your PostgreSQL database.
                    Run the installation script to enable automatic embeddings.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="pgai-enabled"
                      checked={config.pgai.enabled}
                      onCheckedChange={(checked) =>
                        setConfig(prev => ({
                          ...prev,
                          pgai: { ...prev.pgai, enabled: checked }
                        }))
                      }
                    />
                    <Label htmlFor="pgai-enabled">Enable pgai Worker</Label>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold">Vectorizers</h3>
                    {config.pgai.vectorizers.length === 0 ? (
                      <p className="text-muted-foreground">No vectorizers configured</p>
                    ) : (
                      <div className="space-y-2">
                        {config.pgai.vectorizers.map((v, idx) => (
                          <div key={idx} className="border p-2 rounded">
                            <p className="font-medium">{v.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {v.source_table} → {v.destination}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button onClick={() => saveConfiguration("pgai")}>
                    Save Configuration
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create Vectorizer</CardTitle>
              <CardDescription>
                Set up automatic embedding generation for a table
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Source Table</Label>
                  <Input placeholder="documents" />
                </div>
                <div className="space-y-2">
                  <Label>Destination Table</Label>
                  <Input placeholder="embeddings_auto" />
                </div>
              </div>

              <Button>
                <Database className="h-4 w-4 mr-2" />
                Create Vectorizer
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pgvectorscale" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>pgvectorscale Configuration</CardTitle>
              <CardDescription>
                High-performance vector search optimization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!config.pgvectorscale.installed ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>pgvectorscale Not Installed</AlertTitle>
                  <AlertDescription>
                    pgvectorscale extension needs to be installed in PostgreSQL
                    for 28x faster vector search performance.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="pgvectorscale-enabled"
                      checked={config.pgvectorscale.enabled}
                      onCheckedChange={(checked) =>
                        setConfig(prev => ({
                          ...prev,
                          pgvectorscale: { ...prev.pgvectorscale, enabled: checked }
                        }))
                      }
                    />
                    <Label htmlFor="pgvectorscale-enabled">Use pgvectorscale Indexes</Label>
                  </div>

                  <Alert>
                    <Zap className="h-4 w-4" />
                    <AlertTitle>Performance Boost</AlertTitle>
                    <AlertDescription>
                      With pgvectorscale enabled, you can expect:
                      <ul className="list-disc list-inside mt-2">
                        <li>28x lower p95 latency</li>
                        <li>16x higher query throughput</li>
                        <li>75% cost reduction</li>
                      </ul>
                    </AlertDescription>
                  </Alert>

                  <Button onClick={() => saveConfiguration("pgvectorscale")}>
                    Save Configuration
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Service Logs</CardTitle>
              <CardDescription>
                View real-time logs from Python services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-black text-green-400 p-4 rounded font-mono text-sm h-96 overflow-auto">
                <div className="space-y-1">
                  <p>[2024-10-29 16:45:00] INFO | Starting LSEMB Python Services...</p>
                  <p>[2024-10-29 16:45:01] INFO | ✅ PostgreSQL connected</p>
                  <p>[2024-10-29 16:45:01] INFO | ✅ Redis connected successfully</p>
                  <p>[2024-10-29 16:45:02] INFO | FastAPI server running on port 8001</p>
                  <p>[2024-10-29 16:45:10] INFO | Health check endpoint called</p>
                  <p>[2024-10-29 16:45:15] INFO | Crawl4AI: Processing URL https://example.com</p>
                  <p>[2024-10-29 16:45:18] INFO | Crawl4AI: Successfully extracted content</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}