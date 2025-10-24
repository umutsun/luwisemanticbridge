'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
  Sankey
} from 'recharts';
import { 
  Brain,
  Network,
  Database,
  TrendingUp,
  Users,
  FileText,
  MessageSquare,
  Layers,
  Activity,
  Zap,
  Link,
  Globe,
  RefreshCw,
  Download,
  Filter,
  Search,
  Eye,
  GitBranch,
  Share2,
  Sparkles,
  Info
} from 'lucide-react';

interface GraphNode {
  id: string;
  label: string;
  type: 'entity' | 'concept' | 'document' | 'chunk';
  size: number;
  connections: number;
  metadata?: any;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: 'semantic' | 'reference' | 'similarity';
}

interface AnalyticsData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    avgDegree: number;
    density: number;
    communities: number;
    centralNodes: string[];
  };
  insights: {
    topEntities: Array<{ name: string; mentions: number; importance: number }>;
    topConcepts: Array<{ concept: string; frequency: number; connections: number }>;
    documentClusters: Array<{ id: string; size: number; topic: string }>;
    semanticDensity: number;
    knowledgeCoverage: number;
  };
}

export default function AnalyticsDashboard() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<'2d' | '3d' | 'network'>('network');
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('7d');

  
  // Fetch analytics data
  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/v2/lightrag/analytics');
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      // Mock data for demonstration
      setAnalyticsData(generateMockData());
    } finally {
      setLoading(false);
    }
  };

  // Generate mock data for demonstration
  const generateMockData = (): AnalyticsData => {
    return {
      nodes: [
        { id: '1', label: 'Machine Learning', type: 'concept', size: 45, connections: 12 },
        { id: '2', label: 'Neural Networks', type: 'concept', size: 38, connections: 8 },
        { id: '3', label: 'Data Processing', type: 'concept', size: 32, connections: 6 },
        { id: '4', label: 'Algorithm Design', type: 'concept', size: 28, connections: 5 },
        { id: '5', label: 'Document A', type: 'document', size: 25, connections: 4 },
        { id: '6', label: 'Research Paper B', type: 'document', size: 22, connections: 3 },
        { id: '7', label: 'Technical Report', type: 'document', size: 20, connections: 3 },
        { id: '8', label: 'AI Entity', type: 'entity', size: 35, connections: 7 }
      ],
      edges: [
        { source: '1', target: '2', weight: 0.9, type: 'semantic' },
        { source: '1', target: '3', weight: 0.7, type: 'semantic' },
        { source: '2', target: '4', weight: 0.8, type: 'similarity' },
        { source: '5', target: '1', weight: 0.6, type: 'reference' },
        { source: '6', target: '2', weight: 0.7, type: 'reference' },
        { source: '7', target: '3', weight: 0.5, type: 'reference' },
        { source: '8', target: '1', weight: 0.85, type: 'semantic' }
      ],
      stats: {
        totalNodes: 127,
        totalEdges: 342,
        avgDegree: 5.4,
        density: 0.043,
        communities: 8,
        centralNodes: ['Machine Learning', 'Neural Networks', 'Data Science']
      },
      insights: {
        topEntities: [
          { name: 'OpenAI', mentions: 45, importance: 0.92 },
          { name: 'Google AI', mentions: 38, importance: 0.85 },
          { name: 'Microsoft', mentions: 32, importance: 0.78 },
          { name: 'Meta AI', mentions: 28, importance: 0.72 },
          { name: 'Anthropic', mentions: 25, importance: 0.68 }
        ],
        topConcepts: [
          { concept: 'Machine Learning', frequency: 156, connections: 45 },
          { concept: 'Natural Language', frequency: 142, connections: 38 },
          { concept: 'Computer Vision', frequency: 98, connections: 28 },
          { concept: 'Data Analysis', frequency: 87, connections: 24 },
          { concept: 'Automation', frequency: 76, connections: 21 }
        ],
        documentClusters: [
          { id: 'cluster-1', size: 23, topic: 'AI Research' },
          { id: 'cluster-2', size: 18, topic: 'Technical Documentation' },
          { id: 'cluster-3', size: 15, topic: 'Business Reports' },
          { id: 'cluster-4', size: 12, topic: 'User Guides' }
        ],
        semanticDensity: 0.73,
        knowledgeCoverage: 0.86
      }
    };
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  // Prepare chart data
  const conceptFrequencyData = analyticsData?.insights.topConcepts.map(c => ({
    name: c.concept,
    frequency: c.frequency,
    connections: c.connections
  })) || [];

  const entityImportanceData = analyticsData?.insights.topEntities.map(e => ({
    name: e.name,
    mentions: e.mentions,
    importance: e.importance * 100
  })) || [];

  const clusterData = analyticsData?.insights.documentClusters.map(c => ({
    name: c.topic,
    value: c.size
  })) || [];

  const networkDensityData = [
    { metric: 'Nodes', value: analyticsData?.stats.totalNodes || 0, max: 200 },
    { metric: 'Edges', value: analyticsData?.stats.totalEdges || 0, max: 500 },
    { metric: 'Density', value: (analyticsData?.stats.density || 0) * 100, max: 100 },
    { metric: 'Communities', value: analyticsData?.stats.communities || 0, max: 20 },
    { metric: 'Avg Degree', value: analyticsData?.stats.avgDegree || 0, max: 10 }
  ];

  const radarData = [
    { subject: 'Semantic Richness', A: 85, fullMark: 100 },
    { subject: 'Data Coverage', A: 92, fullMark: 100 },
    { subject: 'Entity Recognition', A: 78, fullMark: 100 },
    { subject: 'Concept Extraction', A: 88, fullMark: 100 },
    { subject: 'Relationship Mapping', A: 76, fullMark: 100 },
    { subject: 'Knowledge Density', A: 82, fullMark: 100 }
  ];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Semantik Analiz & Görselleştirme</h1>
          <p className="text-muted-foreground mt-1">
            Verilerinizin derinlemesine analizini ve ilişki haritasını keşfedin
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAnalytics}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Yenile
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Rapor İndir
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Toplam Node</CardTitle>
              <Network className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData?.stats.totalNodes || 0}</div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                {analyticsData?.stats.communities || 0} Topluluk
              </Badge>
              <TrendingUp className="h-3 w-3 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900 dark:to-green-800">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">İlişki Sayısı</CardTitle>
              <Link className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData?.stats.totalEdges || 0}</div>
            <Progress value={(analyticsData?.stats.density || 0) * 100} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Yoğunluk: {((analyticsData?.stats.density || 0) * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900 dark:to-purple-800">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Semantik Yoğunluk</CardTitle>
              <Brain className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((analyticsData?.insights.semanticDensity || 0) * 100).toFixed(0)}%
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Sparkles className="h-3 w-3 text-yellow-500" />
              <span className="text-xs">Yüksek Kalite</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900 dark:to-orange-800">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Bilgi Kapsama</CardTitle>
              <Database className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((analyticsData?.insights.knowledgeCoverage || 0) * 100).toFixed(0)}%
            </div>
            <Badge variant="success" className="mt-2">Optimal</Badge>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-900 dark:to-pink-800">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm">Merkezi Düğümler</CardTitle>
              <GitBranch className="h-5 w-5 text-pink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData?.stats.centralNodes?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Avg: {analyticsData?.stats.avgDegree?.toFixed(1) || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="knowledge-graph">Bilgi Grafiği</TabsTrigger>
          <TabsTrigger value="entities">Varlık Analizi</TabsTrigger>
          <TabsTrigger value="concepts">Konsept Haritası</TabsTrigger>
          <TabsTrigger value="insights">Öngörüler</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Semantic Analysis Radar */}
            <Card>
              <CardHeader>
                <CardTitle>Semantik Analiz Profili</CardTitle>
                <CardDescription>
                  Veri kümesinin çok boyutlu analizi
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar
                      name="Performans"
                      dataKey="A"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Concept Frequency */}
            <Card>
              <CardHeader>
                <CardTitle>Konsept Frekansları</CardTitle>
                <CardDescription>
                  En sık kullanılan konseptler ve bağlantıları
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={conceptFrequencyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="frequency" fill="#3b82f6" name="Frekans" />
                    <Bar dataKey="connections" fill="#10b981" name="Bağlantılar" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Document Clusters */}
            <Card>
              <CardHeader>
                <CardTitle>Doküman Kümeleri</CardTitle>
                <CardDescription>Tematik gruplama</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={clusterData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({name, value}) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {clusterData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Entity Importance */}
            <Card>
              <CardHeader>
                <CardTitle>Varlık Önemi</CardTitle>
                <CardDescription>En kritik varlıklar</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {entityImportanceData.slice(0, 5).map((entity, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{idx + 1}</Badge>
                        <span className="text-sm font-medium">{entity.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={entity.importance} className="w-20" />
                        <span className="text-xs text-muted-foreground">
                          {entity.mentions}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Network Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Ağ İstatistikleri</CardTitle>
                <CardDescription>Graf metrikleri</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {networkDensityData.map((stat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{stat.metric}</span>
                        <span className="font-medium">{stat.value.toFixed(0)}</span>
                      </div>
                      <Progress value={(stat.value / stat.max) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Knowledge Graph Tab */}
        <TabsContent value="knowledge-graph" className="space-y-4">
          <Card className="h-[600px]">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>İnteraktif Bilgi Grafiği</CardTitle>
                  <CardDescription>
                    Veri noktaları arasındaki ilişkileri keşfedin
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={selectedView === 'network' ? 'default' : 'outline'}
                    onClick={() => setSelectedView('network')}
                  >
                    Network
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedView === '2d' ? 'default' : 'outline'}
                    onClick={() => setSelectedView('2d')}
                  >
                    2D Graf
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedView === '3d' ? 'default' : 'outline'}
                    onClick={() => setSelectedView('3d')}
                  >
                    3D Graf
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-full">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg h-[480px] flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Network className="h-16 w-16 mx-auto text-primary opacity-50" />
                  <div>
                    <h3 className="font-medium">Bilgi Grafiği Görselleştirmesi</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {analyticsData?.nodes.length || 0} düğüm ve {analyticsData?.edges.length || 0} bağlantı
                    </p>
                  </div>
                  <div className="flex justify-center gap-4 mt-4">
                    <Badge variant="outline">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
                      Konseptler
                    </Badge>
                    <Badge variant="outline">
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                      Dokümanlar
                    </Badge>
                    <Badge variant="outline">
                      <div className="w-2 h-2 bg-purple-500 rounded-full mr-2" />
                      Varlıklar
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Entities Tab */}
        <TabsContent value="entities" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Varlık İlişki Matrisi</CardTitle>
                <CardDescription>
                  Varlıklar arası bağlantı yoğunluğu
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-1">
                  {Array.from({length: 25}).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded"
                      style={{
                        backgroundColor: `rgba(59, 130, 246, ${Math.random()})`
                      }}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {analyticsData?.stats.centralNodes?.slice(0, 3).map((node, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span className="text-sm font-medium">{node}</span>
                      <Badge variant="outline">Merkezi Düğüm</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Varlık Zaman Çizelgesi</CardTitle>
                <CardDescription>
                  Zaman içindeki varlık aktivitesi
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={[
                    { time: 'Pzt', entities: 12, mentions: 45 },
                    { time: 'Sal', entities: 15, mentions: 52 },
                    { time: 'Çar', entities: 18, mentions: 61 },
                    { time: 'Per', entities: 14, mentions: 48 },
                    { time: 'Cum', entities: 22, mentions: 73 },
                    { time: 'Cmt', entities: 19, mentions: 65 },
                    { time: 'Paz', entities: 16, mentions: 58 }
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="entities" stroke="#3b82f6" name="Varlıklar" />
                    <Line type="monotone" dataKey="mentions" stroke="#10b981" name="Bahsetmeler" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Concepts Tab */}
        <TabsContent value="concepts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Konsept Hiyerarşisi</CardTitle>
              <CardDescription>
                Kavramsal ilişkiler ve bağımlılıklar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {analyticsData?.insights.topConcepts.map((concept, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            <Brain className="h-4 w-4 text-primary" />
                            {concept.concept}
                          </h4>
                          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                            <span>Frekans: {concept.frequency}</span>
                            <span>Bağlantılar: {concept.connections}</span>
                          </div>
                        </div>
                        <Badge variant="outline">Seviye {idx + 1}</Badge>
                      </div>
                      <Progress value={(concept.frequency / 200) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Anahtar Bulgular
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5" />
                    <span>Veri setinde {analyticsData?.stats.communities || 0} farklı tematik topluluk tespit edildi</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5" />
                    <span>En yoğun ilişki ağı "Machine Learning" konsepti etrafında</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5" />
                    <span>Ortalama bağlantı derecesi {analyticsData?.stats.avgDegree?.toFixed(1) || 0} ile optimal seviyede</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50 dark:bg-green-950">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Öneriler
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5" />
                    <span>Düşük bağlantılı dokümanları güçlendirin</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5" />
                    <span>Merkezi düğümlere daha fazla içerik ekleyin</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1.5" />
                    <span>İzole kümeler arasında köprüler oluşturun</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Fırsatlar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1.5" />
                    <span>%{((1 - (analyticsData?.insights.knowledgeCoverage || 0)) * 100).toFixed(0)} bilgi boşluğu doldurulabilir</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1.5" />
                    <span>Yeni konsept bağlantıları keşfedilebilir</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1.5" />
                    <span>Otomatik içerik önerileri üretilebilir</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}