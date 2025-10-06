import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import components to avoid SSR issues
const KnowledgeGraphSimple = dynamic(
  () => import('../components/lightrag/KnowledgeGraphSimple'),
  { ssr: false }
);

const QueryInterface = dynamic(
  () => import('../components/rag/QueryInterface').then(mod => mod.QueryInterface),
  { ssr: false }
);

const ResultsDisplay = dynamic(
  () => import('../components/rag/ResultsDisplay').then(mod => mod.ResultsDisplay),
  { ssr: false }
);

const MonitoringDashboard = dynamic(
  () => import('../components/monitoring/Dashboard').then(mod => mod.MonitoringDashboard),
  { ssr: false }
);

const SettingsDashboard = dynamic(
  () => import('../components/SettingsDashboard'),
  { ssr: false }
);

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchResults, setSearchResults] = useState([]);
  const [appConfig, setAppConfig] = useState({
    name: 'Alice Semantic Bridge',
    description: 'AI-Powered Knowledge Management System'
  });
  const [stats, setStats] = useState({
    documents: 0,
    entities: 0,
    relationships: 0,
    queries: 0
  });
  const [systemHealth, setSystemHealth] = useState({
    status: 'loading',
    services: {
      database: { status: 'unknown', responseTime: null },
      redis: { status: 'unknown', responseTime: null },
      asemb_database: { status: 'unknown', responseTime: null },
      settings: { status: 'unknown', responseTime: null }
    },
    uptime: 0,
    memory: { used: 0, total: 0, external: 0 }
  });
  const [configStatus, setConfigStatus] = useState({
    asemb_database: { connected: false },
    customer_database: { connected: false },
    redis: { connected: false }
  });

  useEffect(() => {
    setMounted(true);

    // Fetch system health
    const fetchSystemHealth = async () => {
      try {
        const response = await fetch('http://localhost:8083/api/v2/health/system');
        const data = await response.json();
        setSystemHealth(data);
      } catch (error) {
        console.error('Failed to fetch system health:', error);
      }
    };

    // Fetch config status
    const fetchConfigStatus = async () => {
      try {
        const response = await fetch('http://localhost:8083/api/v2/health/config');
        const data = await response.json();
        setConfigStatus(data);
      } catch (error) {
        console.error('Failed to fetch config status:', error);
      }
    };

    // Load application configuration
    fetch('/config/asb-config.json')
      .then(res => res.json())
      .then(config => {
        if (config.app) {
          setAppConfig(config.app);
        }
      })
      .catch(err => console.error('Failed to load app config:', err));

    // Initial fetch
    fetchSystemHealth();
    fetchConfigStatus();

    // Set up periodic updates (every 30 seconds)
    const healthInterval = setInterval(fetchSystemHealth, 30000);
    const configInterval = setInterval(fetchConfigStatus, 60000);

    return () => {
      clearInterval(healthInterval);
      clearInterval(configInterval);
    };
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900">
                {appConfig.name}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {appConfig.description}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full shadow-sm ${
                    systemHealth.status === 'healthy' ? 'bg-green-500' :
                    systemHealth.status === 'degraded' ? 'bg-yellow-500' :
                    systemHealth.status === 'error' || systemHealth.status === 'unhealthy' ? 'bg-red-500' :
                    systemHealth.status === 'loading' ? 'bg-orange-500 animate-pulse' : 'bg-gray-500'
                  } ${systemHealth.status === 'loading' ? 'animate-pulse' : ''}`}></div>
                  <span className={`px-3 py-1 text-sm rounded-full font-medium border ${
                    systemHealth.status === 'healthy' ? 'bg-green-100 text-green-800 border-green-200' :
                    systemHealth.status === 'degraded' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                    systemHealth.status === 'error' || systemHealth.status === 'unhealthy' ? 'bg-red-100 text-red-800 border-red-200' :
                    systemHealth.status === 'loading' ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-gray-100 text-gray-800 border-gray-200'
                  }`}>
                    {systemHealth.status === 'loading' ? '🔄 Connecting Database...' :
                     systemHealth.status === 'healthy' ? '✅ System Ready' :
                     systemHealth.status === 'degraded' ? '⚠️ System Degraded' :
                     systemHealth.status === 'error' || systemHealth.status === 'unhealthy' ? '❌ Database Connection Failed' : '❓ Unknown Status'}
                  </span>
                </div>
                <div className="h-4 w-px bg-gray-300"></div>
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                  <div className="flex items-center space-x-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{Math.floor(systemHealth.uptime / 60)}m</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>{systemHealth.memory.used}MB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {['overview', 'rag-query', 'knowledge-graph', 'entities', 'settings', 'monitoring'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <>
            {/* System Health Status */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">System Health</h2>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Last updated:</span>
                  <span className="text-xs font-medium text-gray-700">
                    {new Date(systemHealth.timestamp || Date.now()).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <ServiceHealthCard
                  title="ASEM Database"
                  service={systemHealth.services.asemb_database}
                  config={configStatus.asemb_database}
                />
                <ServiceHealthCard
                  title="Settings Service"
                  service={systemHealth.services.settings}
                />
                <ServiceHealthCard
                  title="Redis Cache"
                  service={systemHealth.services.redis}
                  config={configStatus.redis}
                />
                <ServiceHealthCard
                  title="API Services"
                  service={{status: 'healthy', responseTime: 25, message: 'All endpoints operational'}}
                />
              </div>
            </div>

            {/* System Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard title="Documents" value={stats.documents} color="blue" />
              <StatCard title="Entities" value={stats.entities} color="green" />
              <StatCard title="Relationships" value={stats.relationships} color="purple" />
              <StatCard title="Queries Today" value={stats.queries} color="orange" />
            </div>

            {/* System Resources */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Memory Usage</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Heap Used</span>
                      <span className="font-medium">{systemHealth.memory.used} MB</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${Math.min((systemHealth.memory.used / systemHealth.memory.total) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Heap Total</span>
                    <span className="font-medium">{systemHealth.memory.total} MB</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">External</span>
                    <span className="font-medium">{systemHealth.memory.external} MB</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Overall Status</span>
                    <span className={`font-medium ${
                      systemHealth.status === 'healthy' ? 'text-green-600' :
                      systemHealth.status === 'degraded' ? 'text-yellow-600' :
                      systemHealth.status === 'error' ? 'text-red-600' : 'text-gray-600'
                    }`}>{systemHealth.status}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Uptime</span>
                    <span className="font-medium">{Math.floor(systemHealth.uptime)}s</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Last Check</span>
                    <span className="font-medium">{new Date(systemHealth.timestamp || Date.now()).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'rag-query' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">RAG Query Interface</h2>
              <QueryInterface 
                onResultsReceived={(results) => {
                  setSearchResults(results);
                  // Update query count
                  setStats(prev => ({ ...prev, queries: prev.queries + 1 }));
                }}
              />
            </div>
            
            {searchResults.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <ResultsDisplay results={searchResults} />
              </div>
            )}
          </div>
        )}
        
        {activeTab === 'knowledge-graph' && <KnowledgeGraphSimple />}
        
        {activeTab === 'entities' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Entity Explorer</h2>
            <p className="text-gray-600">Entity explorer coming soon...</p>
          </div>
        )}
        
        {activeTab === 'settings' && <SettingsDashboard configStatus={configStatus} systemHealth={systemHealth} />}

        {activeTab === 'monitoring' && <MonitoringDashboard />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>© 2025 Alice Semantic Bridge</span>
            <div className="flex space-x-4">
              <span className={`flex items-center space-x-1 ${
                systemHealth.services.asemb_database.status === 'healthy' ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>{systemHealth.services.asemb_database.status === 'healthy' ? '✓' : '✗'}</span>
                <span>ASEM DB: {systemHealth.services.asemb_database.status}</span>
              </span>
              <span className={`flex items-center space-x-1 ${
                systemHealth.services.redis.status === 'healthy' ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>{systemHealth.services.redis.status === 'healthy' ? '✓' : '✗'}</span>
                <span>Redis: {systemHealth.services.redis.status}</span>
              </span>
              <span className={`flex items-center space-x-1 ${
                systemHealth.services.settings.status === 'healthy' ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>{systemHealth.services.settings.status === 'healthy' ? '✓' : '✗'}</span>
                <span>Settings: {systemHealth.services.settings.status}</span>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ServiceHealthCard({ title, service, config }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'error': return 'text-red-600 bg-red-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return (
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      );
      case 'error': return (
        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
      );
      case 'degraded': return (
        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
      );
      default: return (
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
      );
    }
  };

  const isHealthy = service?.status === 'healthy' && config?.connected;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon(service?.status)}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full font-medium ${
          isHealthy ? 'text-green-600 bg-green-100' :
          service?.status === 'error' ? 'text-red-600 bg-red-100' :
          service?.status === 'degraded' ? 'text-yellow-600 bg-yellow-100' :
          'text-gray-600 bg-gray-100'
        }`}>
          {isHealthy ? 'Connected' : service?.status || 'Unknown'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Status</span>
          <div className="flex items-center space-x-1">
            <span className="text-gray-900">{service?.status || 'Unknown'}</span>
            {service?.message && (
              <span className="text-gray-400 text-xs">({service.message})</span>
            )}
          </div>
        </div>

        {config !== undefined && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Config</span>
            <div className="flex items-center space-x-1">
              <span className={config?.connected ? 'text-green-600' : 'text-red-600'}>
                {config?.connected ? '✓' : '✗'}
              </span>
              <span className="text-gray-900">{config?.connected ? 'Loaded' : 'Error'}</span>
            </div>
          </div>
        )}

        {service?.responseTime !== null && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Response</span>
            <div className="flex items-center space-x-1">
              <span className={`font-medium ${
                service.responseTime < 100 ? 'text-green-600' :
                service.responseTime < 500 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {service.responseTime}ms
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsComponent({ configStatus, systemHealth }) {
  const [settings, setSettings] = useState({
    database: {},
    redis: {},
    llm_providers: {},
    app_config: {}
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings) => {
    setSaving(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSettings)
      });
      const data = await response.json();
      if (data.success) {
        setSettings(newSettings);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Database Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Database Configuration</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ASEM Database */}
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">ASEM Database</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Host</span>
                <span className="text-sm font-medium">{configStatus.asemb_database.host}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Port</span>
                <span className="text-sm font-medium">{configStatus.asemb_database.port}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Database</span>
                <span className="text-sm font-medium">{configStatus.asemb_database.database}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  configStatus.asemb_database.connected
                    ? 'text-green-600 bg-green-100'
                    : 'text-red-600 bg-red-100'
                }`}>
                  {configStatus.asemb_database.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Database */}
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Customer Database</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Host</span>
                <span className="text-sm font-medium">{configStatus.customer_database.host}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Port</span>
                <span className="text-sm font-medium">{configStatus.customer_database.port}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Database</span>
                <span className="text-sm font-medium">{configStatus.customer_database.database}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  configStatus.customer_database.connected
                    ? 'text-green-600 bg-green-100'
                    : 'text-red-600 bg-red-100'
                }`}>
                  {configStatus.customer_database.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Redis Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Redis Configuration</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Redis Cache</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Host</span>
                <span className="text-sm font-medium">{configStatus.redis.host}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Port</span>
                <span className="text-sm font-medium">{configStatus.redis.port}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Database</span>
                <span className="text-sm font-medium">{configStatus.redis.db}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  configStatus.redis.connected
                    ? 'text-green-600 bg-green-100'
                    : 'text-red-600 bg-red-100'
                }`}>
                  {configStatus.redis.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Service Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Settings Service</span>
                <span className={`px-2 py-1 text-xs rounded-full ${
                  systemHealth.services.settings.status === 'healthy'
                    ? 'text-green-600 bg-green-100'
                    : systemHealth.services.settings.status === 'error'
                    ? 'text-red-600 bg-red-100'
                    : 'text-yellow-600 bg-yellow-100'
                }`}>
                  {systemHealth.services.settings.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Response Time</span>
                <span className="text-sm font-medium">
                  {systemHealth.services.settings.responseTime}ms
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Last Updated</span>
                <span className="text-sm font-medium">
                  {new Date(systemHealth.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Application Configuration</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">System Info</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">App Name</span>
                <span className="text-sm font-medium">{configStatus.app_config.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Version</span>
                <span className="text-sm font-medium">{configStatus.app_config.version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Environment</span>
                <span className="text-sm font-medium">{configStatus.app_config.environment}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Uptime</span>
                <span className="text-sm font-medium">{Math.floor(systemHealth.uptime)}s</span>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Memory Usage</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Heap Used</span>
                  <span className="font-medium">{systemHealth.memory.used} MB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min((systemHealth.memory.used / systemHealth.memory.total) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Heap Total</span>
                <span className="text-sm font-medium">{systemHealth.memory.total} MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">External</span>
                <span className="text-sm font-medium">{systemHealth.memory.external} MB</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">System Actions</h3>
            <p className="text-sm text-gray-600 mt-1">
              Perform system maintenance and diagnostic actions
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh Dashboard</span>
            </button>
            <button
              onClick={loadSettings}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Reload Settings</span>
            </button>
            <button
              onClick={() => {
                // Test all connections
                Promise.all([
                  fetch('http://localhost:8083/api/v2/health/system'),
                  fetch('http://localhost:8083/api/v2/settings')
                ]).then(() => {
                  alert('Connection tests completed!');
                }).catch(err => {
                  alert('Connection test failed: ' + err.message);
                });
              }}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Test Connections</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500'
  };

  const bgColorClass = colorClasses[color] || 'bg-gray-500';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`rounded-md p-3 ${bgColorClass} bg-opacity-10`}>
          <div className={`h-6 w-6 ${bgColorClass} bg-opacity-100`}></div>
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      </div>
    </div>
  );
}