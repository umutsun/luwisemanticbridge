'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Server, 
  Play, 
  Square, 
  RefreshCw, 
  Terminal,
  Database,
  Brain,
  Container,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Cpu,
  HardDrive,
  Info,
  Settings,
  FileCode,
  Globe,
  Zap,
  Package
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  port?: number;
  pid?: number;
  memory?: string;
  cpu?: string;
  uptime?: string;
  logs?: string[];
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string[];
  created: string;
}

export default function ServicesPage() {

  const { toast } = useToast();
  const [services, setServices] = useState<Record<string, ServiceStatus>>({
    lightrag: {
      name: 'LightRAG API',
      status: 'stopped',
      port: 8084,
    },
    raganything: {
      name: 'RAGAnything',
      status: 'stopped',
      port: 8085,
    },
    embedder: {
      name: 'Embedder Service',
      status: 'stopped',
      port: 8086,
    },
    ollama: {
      name: 'Ollama',
      status: 'stopped',
      port: 11434,
    }
  });

  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [autoStart, setAutoStart] = useState<Record<string, boolean>>({
    lightrag: false,
    raganything: false,
    embedder: false,
    ollama: false,
    postgres: true,
    redis: true
  });

  useEffect(() => {
    checkServicesStatus();
    checkDockerContainers();
    const interval = setInterval(() => {
      checkServicesStatus();
      checkDockerContainers();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkServicesStatus = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/services/status');
      if (response.ok) {
        const data = await response.json();
        setServices(data.services);
      }
    } catch (error) {
      console.error('Failed to check services:', error);
    }
  };

  const checkDockerContainers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/v2/services/docker');
      if (response.ok) {
        const data = await response.json();
        setDockerContainers(data.containers || []);
      }
    } catch (error) {
      console.error('Failed to check Docker containers:', error);
    }
  };

  const handleServiceToggle = async (serviceId: string, action: 'start' | 'stop' | 'restart') => {
    setLoading({ ...loading, [serviceId]: true });
    
    try {
      const response = await fetch('http://localhost:3003/api/v2/services/' + serviceId + '/' + action, {
        method: 'POST',
      });

      if (response.ok) {
        toast({
          title: (action === 'start' ? 'Başlatılıyor' : action === 'stop' ? 'Durduruluyor' : 'Yeniden Başlatılıyor') + ' ✨',
          description: services[serviceId].name + ' servisi ' + (action === 'start' ? 'başlatılıyor' : action === 'stop' ? 'durduruluyor' : 'yeniden başlatılıyor') + '...',
          duration: 2000,
        });
        
        // Status'u geçici olarak güncelle
        setServices({
          ...services,
          [serviceId]: {
            ...services[serviceId],
            status: action === 'start' ? 'starting' : action === 'stop' ? 'stopping' : 'starting'
          }
        });

        // 2 saniye sonra gerçek status'u kontrol et
        setTimeout(checkServicesStatus, 2000);
      } else {
        throw new Error('Service control failed');
      }
    } catch (error) {
      toast({
        title: 'Hata',
        description: services[serviceId].name + ' servisi kontrol edilemedi',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading({ ...loading, [serviceId]: false });
    }
  };

  const handleDockerAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    try {
      const response = await fetch('http://localhost:3003/api/v2/services/docker/' + containerId + '/' + action, {
        method: 'POST',
      });

      if (response.ok) {
        toast({
          title: 'Docker İşlemi',
          description: `Container ${action} işlemi başarılı`,
          duration: 2000,
        });
        checkDockerContainers();
      }
    } catch (error) {
      toast({
        title: 'Docker Hatası',
        description: 'Container işlemi başarısız',
        variant: 'destructive',
        duration: 3000,
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'stopped': return 'bg-gray-400';
      case 'error': return 'bg-red-500';
      case 'starting': return 'bg-yellow-500 animate-pulse';
      case 'stopping': return 'bg-orange-500 animate-pulse';
      default: return 'bg-gray-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-green-100 text-green-800 border-green-200">Çalışıyor</Badge>;
      case 'stopped': return <Badge variant="secondary">Durduruldu</Badge>;
      case 'error': return <Badge variant="destructive">Hata</Badge>;
      case 'starting': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Başlatılıyor...</Badge>;
      case 'stopping': return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Durduruluyor...</Badge>;
      default: return <Badge variant="outline">Bilinmiyor</Badge>;
    }
  };

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Servis Yönetimi</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Python servisleri, Docker container'ları ve sistem bileşenlerini yönetin
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkServicesStatus}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Button variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Yapılandırma
          </Button>
        </div>
      </div>

      <Tabs defaultValue="python" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="python">Python Servisleri</TabsTrigger>
          <TabsTrigger value="docker">Docker</TabsTrigger>
          <TabsTrigger value="system">Sistem</TabsTrigger>
          <TabsTrigger value="logs">Loglar</TabsTrigger>
        </TabsList>

        {/* Python Services Tab */}
        <TabsContent value="python" className="space-y-4">
          <div className="grid gap-4">
            {/* LightRAG Service */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(services.lightrag.status)}`} />
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="h-5 w-5" />
                      LightRAG API Service
                    </CardTitle>
                  </div>
                  {getStatusBadge(services.lightrag.status)}
                </div>
                <CardDescription>
                  Graph-based RAG engine for semantic search • Port: {services.lightrag.port}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Script:</span>
                        <code className="px-2 py-1 bg-background rounded text-xs">
                          backend/lightrag_api.py
                        </code>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Command:</span>
                        <code className="px-2 py-1 bg-background rounded text-xs">
                          python lightrag_api.py --port 8084
                        </code>
                      </div>
                      {services.lightrag.status === 'running' && (
                        <div className="flex gap-6 text-sm">
                          <span className="flex items-center gap-1">
                            <Cpu className="h-3 w-3" />
                            CPU: {services.lightrag.cpu || '2%'}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            RAM: {services.lightrag.memory || '256MB'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Uptime: {services.lightrag.uptime || '2h 15m'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {services.lightrag.status === 'stopped' ? (
                        <Button 
                          onClick={() => handleServiceToggle('lightrag', 'start')}
                          disabled={loading.lightrag}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Başlat
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant="outline"
                            onClick={() => handleServiceToggle('lightrag', 'restart')}
                            disabled={loading.lightrag}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => handleServiceToggle('lightrag', 'stop')}
                            disabled={loading.lightrag}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-lightrag" className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Otomatik başlat
                    </Label>
                    <Switch 
                      id="auto-lightrag"
                      checked={autoStart.lightrag}
                      onCheckedChange={(checked) => setAutoStart({...autoStart, lightrag: checked})}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RAGAnything Service */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(services.raganything.status)}`} />
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      RAGAnything Service
                    </CardTitle>
                  </div>
                  {getStatusBadge(services.raganything.status)}
                </div>
                <CardDescription>
                  Multi-modal RAG processing engine • Port: {services.raganything.port}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Script:</span>
                        <code className="px-2 py-1 bg-background rounded text-xs">
                          backend/raganything_server.py
                        </code>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Command:</span>
                        <code className="px-2 py-1 bg-background rounded text-xs">
                          python raganything_server.py --port 8085
                        </code>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {services.raganything.status === 'stopped' ? (
                        <Button 
                          onClick={() => handleServiceToggle('raganything', 'start')}
                          disabled={loading.raganything}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Başlat
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant="outline"
                            onClick={() => handleServiceToggle('raganything', 'restart')}
                            disabled={loading.raganything}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => handleServiceToggle('raganything', 'stop')}
                            disabled={loading.raganything}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-raganything" className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Otomatik başlat
                    </Label>
                    <Switch 
                      id="auto-raganything"
                      checked={autoStart.raganything}
                      onCheckedChange={(checked) => setAutoStart({...autoStart, raganything: checked})}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Embedder Service */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(services.embedder.status)}`} />
                    <CardTitle className="flex items-center gap-2">
                      <FileCode className="h-5 w-5" />
                      Embedder Service
                    </CardTitle>
                  </div>
                  {getStatusBadge(services.embedder.status)}
                </div>
                <CardDescription>
                  Text embedding generation service • Port: {services.embedder.port}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Script:</span>
                        <code className="px-2 py-1 bg-background rounded text-xs">
                          backend/embedder_service.py
                        </code>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {services.embedder.status === 'stopped' ? (
                        <Button 
                          onClick={() => handleServiceToggle('embedder', 'start')}
                          disabled={loading.embedder}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Başlat
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant="outline"
                            onClick={() => handleServiceToggle('embedder', 'restart')}
                            disabled={loading.embedder}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => handleServiceToggle('embedder', 'stop')}
                            disabled={loading.embedder}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-embedder" className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Otomatik başlat
                    </Label>
                    <Switch 
                      id="auto-embedder"
                      checked={autoStart.embedder}
                      onCheckedChange={(checked) => setAutoStart({...autoStart, embedder: checked})}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ollama Service */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${getStatusColor(services.ollama.status)}`} />
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Ollama (Local LLM)
                    </CardTitle>
                  </div>
                  {getStatusBadge(services.ollama.status)}
                </div>
                <CardDescription>
                  Local large language model server • Port: {services.ollama.port}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">Command:</span>
                        <code className="px-2 py-1 bg-background rounded text-xs">
                          ollama serve
                        </code>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {services.ollama.status === 'stopped' ? (
                        <Button 
                          onClick={() => handleServiceToggle('ollama', 'start')}
                          disabled={loading.ollama}
                          className="gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Başlat
                        </Button>
                      ) : (
                        <>
                          <Button 
                            variant="outline"
                            onClick={() => handleServiceToggle('ollama', 'restart')}
                            disabled={loading.ollama}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => handleServiceToggle('ollama', 'stop')}
                            disabled={loading.ollama}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Docker Tab */}
        <TabsContent value="docker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Container className="h-5 w-5" />
                Docker Container'ları
              </CardTitle>
              <CardDescription>
                Çalışan Docker container'larını yönetin
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dockerContainers.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Docker container bulunamadı veya Docker servisi çalışmıyor olabilir.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {dockerContainers.map((container) => (
                    <div key={container.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${container.status.includes('Up') ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className="font-medium">{container.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {container.image}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {container.ports.join(', ')} • {container.status}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {container.status.includes('Up') ? (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDockerAction(container.id, 'restart')}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => handleDockerAction(container.id, 'stop')}
                            >
                              <Square className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <Button 
                            size="sm"
                            onClick={() => handleDockerAction(container.id, 'start')}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Başlat
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Docker Compose */}
          <Card>
            <CardHeader>
              <CardTitle>Docker Compose</CardTitle>
              <CardDescription>
                Tüm servisleri tek komutla yönetin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <code className="text-sm">
                  docker-compose.yml
                </code>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  docker-compose up
                </Button>
                <Button variant="destructive" className="flex-1">
                  <Square className="h-4 w-4 mr-2" />
                  docker-compose down
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  PostgreSQL + pgvector
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Port</span>
                    <span className="text-sm font-mono">5432</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Database</span>
                    <span className="text-sm font-mono">alice_semantic_bridge</span>
                  </div>
                  <Button variant="outline" className="w-full mt-4">
                    <Terminal className="h-4 w-4 mr-2" />
                    psql Console
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Redis Cache
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Port</span>
                    <span className="text-sm font-mono">6379</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Memory</span>
                    <span className="text-sm font-mono">45.2 MB</span>
                  </div>
                  <Button variant="outline" className="w-full mt-4">
                    <Terminal className="h-4 w-4 mr-2" />
                    redis-cli
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Servis Logları</CardTitle>
              <CardDescription>
                Son log kayıtlarını görüntüleyin
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs h-96 overflow-y-auto">
                <div>[2024-01-15 10:23:45] LightRAG: Service started on port 8084</div>
                <div>[2024-01-15 10:23:46] LightRAG: Loading knowledge graph...</div>
                <div>[2024-01-15 10:23:48] LightRAG: Graph loaded successfully (1234 nodes, 5678 edges)</div>
                <div>[2024-01-15 10:24:01] RAGAnything: Service starting...</div>
                <div>[2024-01-15 10:24:02] RAGAnything: Loading models...</div>
                <div>[2024-01-15 10:24:15] Embedder: Initialized with text-embedding-3-small</div>
                <div>[2024-01-15 10:24:20] PostgreSQL: Connection established</div>
                <div>[2024-01-15 10:24:21] Redis: Cache server ready</div>
                <div className="text-yellow-400">[2024-01-15 10:25:01] Warning: High memory usage detected</div>
                <div className="text-red-400">[2024-01-15 10:25:30] Error: Connection timeout to OpenAI API</div>
                <div>[2024-01-15 10:25:31] Retrying connection...</div>
                <div>[2024-01-15 10:25:35] Connection restored</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}