"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Play,
  Square,
  RefreshCw,
  Settings,
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
  Server
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
  icon: any;
}

export default function IntegrationsPage() {
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: "graphql",
      displayName: "GraphQL",
      description: "Query API",
      status: "stopped",
      port: 8083,
      url: "/graphql",
      version: "4.0",
      icon: GitBranch
    },
    {
      name: "python",
      displayName: "Python",
      description: "AI Services",
      status: "stopped",
      port: 8001,
      version: "0.1",
      icon: Code
    },
    {
      name: "crawl4ai",
      displayName: "Crawl4AI",
      description: "Web Scraping",
      status: "stopped",
      port: 8001,
      icon: Globe
    },
    {
      name: "pgai",
      displayName: "pgAI",
      description: "Auto Embeddings",
      status: "stopped",
      version: "0.12",
      icon: Brain
    },
    {
      name: "pgvectorscale",
      displayName: "VectorScale",
      description: "28x Faster",
      status: "running",
      version: "0.8",
      icon: Zap
    },
    {
      name: "nodejs",
      displayName: "Node.js",
      description: "Main API",
      status: "running",
      port: 8083,
      version: "4.18",
      icon: Server
    },
    {
      name: "database",
      displayName: "PostgreSQL",
      description: "Database",
      status: "running",
      port: 5432,
      version: "15",
      icon: Database
    }
  ]);

  const [loading, setLoading] = useState(false);
  const [activeService, setActiveService] = useState<string | null>(null);

  useEffect(() => {
    fetchServicesStatus();
    const interval = setInterval(fetchServicesStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchServicesStatus = async () => {
    try {
      const response = await fetch("/api/v2/integrations/status");
      if (response.ok) {
        const data = await response.json();
        setServices(prev => prev.map(service => {
          const statusData = data[service.name];
          if (statusData) {
            return { ...service, ...statusData };
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
        toast.success(`${serviceName} ${action}ed successfully`);
        setTimeout(fetchServicesStatus, 2000);
      } else {
        throw new Error(`Failed to ${action} service`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} service`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "from-green-500/20 to-green-600/20 border-green-500/30";
      case "stopped":
        return "from-gray-500/20 to-gray-600/20 border-gray-500/30";
      case "error":
        return "from-red-500/20 to-red-600/20 border-red-500/30";
      default:
        return "from-blue-500/20 to-blue-600/20 border-blue-500/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            System Integrations
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage microservices and integrations
          </p>
        </div>
        <Button
          onClick={() => fetchServicesStatus()}
          variant="outline"
          disabled={loading}
          className="backdrop-blur-sm bg-white/50 border-gray-200"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Services Grid - Glassmorphic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {services.map((service) => {
          const Icon = service.icon;
          const isExtension = ["pgai", "pgvectorscale"].includes(service.name);
          const isProtected = ["database", "nodejs"].includes(service.name);

          return (
            <div
              key={service.name}
              className={`
                relative group
                backdrop-blur-xl bg-gradient-to-br ${getStatusColor(service.status)}
                border border-white/20 rounded-2xl
                transition-all duration-300 hover:shadow-xl hover:scale-[1.02]
                cursor-pointer overflow-hidden
                h-[180px]
              `}
              onClick={() => setActiveService(service.name)}
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0 bg-gradient-to-br from-white to-transparent" />
              </div>

              {/* Content */}
              <div className="relative p-5 h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className={`
                      p-2 rounded-lg backdrop-blur-sm
                      ${service.status === 'running'
                        ? 'bg-green-500/20'
                        : 'bg-gray-500/20'}
                    `}>
                      <Icon className="h-5 w-5 text-gray-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">
                        {service.displayName}
                      </h3>
                      <p className="text-xs text-gray-600">
                        {service.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Port/Status */}
                <div className="flex-1 flex items-center">
                  {service.port && (
                    <span className="text-xs text-gray-600 font-mono">
                      :{service.port}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-auto">
                  {isExtension ? (
                    <div className="text-center">
                      <Badge variant="outline" className="text-xs bg-white/30 border-white/40">
                        Extension
                      </Badge>
                    </div>
                  ) : isProtected ? (
                    <div className="text-center">
                      <Badge variant="outline" className="text-xs bg-white/30 border-white/40">
                        Protected
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {service.status === "stopped" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 h-8 bg-white/20 hover:bg-white/30 backdrop-blur-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleServiceAction(service.name, "start");
                          }}
                          disabled={loading}
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-8 bg-white/20 hover:bg-white/30 backdrop-blur-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleServiceAction(service.name, "restart");
                            }}
                            disabled={loading}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 h-8 bg-white/20 hover:bg-white/30 backdrop-blur-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleServiceAction(service.name, "stop");
                            }}
                            disabled={loading}
                          >
                            <Square className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Version - minimal, bottom right */}
                {service.version && (
                  <div className="absolute bottom-2 right-2 text-[10px] text-gray-500">
                    v{service.version}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Service Details - Optional */}
      {activeService && (
        <Card className="backdrop-blur-xl bg-white/50 border-white/20 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">
              {services.find(s => s.name === activeService)?.displayName} Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              Service configuration and logs will appear here.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}