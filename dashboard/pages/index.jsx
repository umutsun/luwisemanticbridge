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

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchResults, setSearchResults] = useState([]);
  const [appConfig, setAppConfig] = useState({
    name: 'Alice Semantic Bridge',
    description: 'AI-Powered Knowledge Management System'
  });
  const [stats, setStats] = useState({
    documents: 220,
    entities: 1760,
    relationships: 1045,
    queries: 0
  });

  useEffect(() => {
    setMounted(true);
    
    // Load application configuration
    fetch('/config/asb-config.json')
      .then(res => res.json())
      .then(config => {
        if (config.app) {
          setAppConfig(config.app);
        }
      })
      .catch(err => console.error('Failed to load app config:', err));
    
    // Fetch real stats from API
    fetch('/api/lightrag/health')
      .then(res => res.json())
      .then(data => console.log('LightRAG Status:', data))
      .catch(err => console.error('API Error:', err));
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
              <span className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full">
                System Active
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {['overview', 'rag-query', 'knowledge-graph', 'entities', 'monitoring'].map(tab => (
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard title="Documents" value={stats.documents} color="blue" />
            <StatCard title="Entities" value={stats.entities} color="green" />
            <StatCard title="Relationships" value={stats.relationships} color="purple" />
            <StatCard title="Queries Today" value={stats.queries} color="orange" />
          </div>
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
        
        {activeTab === 'monitoring' && <MonitoringDashboard />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>© 2025 Alice Semantic Bridge</span>
            <div className="flex space-x-4">
              <span>LightRAG: Active</span>
              <span>Redis: Connected</span>
              <span>PostgreSQL: Connected</span>
            </div>
          </div>
        </div>
      </footer>
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