import React, { useState, useEffect } from 'react';
import * as Toast from '@radix-ui/react-toast';
import { CheckCircle, XCircle, Info } from 'lucide-react';

const SettingsDashboard = ({ configStatus, systemHealth }) => {
  const [config, setConfig] = useState({
    app: {},
    database: {},
    redis: {},
    openai: {},
    google: {},
    anthropic: {},
    deepseek: {},
    embeddings: {},
    llmSettings: {}
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('general');
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/settings');
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded config:', data);
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to load configuration:', error);
      showToast('Failed to load configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async (section, sectionData) => {
    setSaving(true);
    try {
      const response = await fetch('http://localhost:8083/api/v2/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sectionData)
      });

      if (response.ok) {
        showToast(`${section} configuration saved successfully!`, 'success');
        await loadConfiguration();
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      showToast('Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testAPIKey = async (provider, apiKey, model) => {
    try {
      const response = await fetch(`http://localhost:8083/api/v2/models/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, apiKey, model })
      });

      const result = await response.json();

      if (result.success) {
        showToast(`${provider} API key is valid!`, 'success');
      } else {
        showToast(`${provider} API key test failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(`Failed to test ${provider} API key`, 'error');
    }
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">General Settings</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Application Name
          </label>
          <input
            type="text"
            value={config.app?.name || 'Alice Semantic Bridge'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              app: { ...prev.app, name: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <input
            type="text"
            value={config.app?.description || 'AI Powered RAG System'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              app: { ...prev.app, description: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Locale
          </label>
          <select
            value={config.app?.locale || 'tr'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              app: { ...prev.app, locale: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default AI Model
          </label>
          <select
            value={config.llmSettings?.defaultModel || 'claude'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              llmSettings: { ...prev.llmSettings, defaultModel: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="claude">Claude 3</option>
            <option value="openai">GPT-4 / GPT-3.5</option>
            <option value="gemini">Gemini Pro</option>
            <option value="deepseek">DeepSeek Chat</option>
            <option value="deepseek-coder">DeepSeek Coder</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System Temperature (0-1)
          </label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={config.llmSettings?.systemTemperature || 0.1}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              llmSettings: { ...prev.llmSettings, systemTemperature: parseFloat(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Default system-wide temperature for AI responses</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System Max Tokens
          </label>
          <input
            type="number"
            min="100"
            max="8192"
            step="100"
            value={config.llmSettings?.systemMaxTokens || 4096}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              llmSettings: { ...prev.llmSettings, systemMaxTokens: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Maximum tokens for system responses</p>
        </div>
      </div>

      <div className="border-t pt-6">
        <h4 className="text-md font-semibold mb-4">AI Provider Priority</h4>
        <p className="text-sm text-gray-600 mb-4">Drag to reorder AI providers (fallback order)</p>
        <div className="space-y-2">
          {[
            { id: 'claude', name: 'Claude 3 (Anthropic)', icon: '🤖' },
            { id: 'openai', name: 'GPT-4 / GPT-3.5 (OpenAI)', icon: '🧠' },
            { id: 'gemini', name: 'Gemini Pro (Google)', icon: '✨' },
            { id: 'deepseek', name: 'DeepSeek Chat', icon: '🔍' },
            { id: 'deepseek-coder', name: 'DeepSeek Coder', icon: '💻' },
            { id: 'fallback', name: 'Fallback Response', icon: '⚠️' }
          ].map((provider, index) => (
            <div key={provider.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <span className="text-lg">{provider.icon}</span>
                <span className="font-medium">{provider.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Priority: {index + 1}</span>
                <input
                  type="checkbox"
                  checked={config.llmSettings?.enabledProviders?.includes(provider.id) !== false}
                  onChange={(e) => {
                    const enabled = config.llmSettings?.enabledProviders || ['claude', 'openai', 'gemini', 'deepseek'];
                    if (e.target.checked) {
                      enabled.push(provider.id);
                    } else {
                      const idx = enabled.indexOf(provider.id);
                      if (idx > -1) enabled.splice(idx, 1);
                    }
                    setConfig(prev => ({
                      ...prev,
                      llmSettings: { ...prev.llmSettings, enabledProviders: enabled }
                    }));
                  }}
                  className="rounded"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4">Application Settings</h4>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Logo URL
          </label>
          <input
            type="url"
            value={config.app?.logoUrl || ''}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              app: { ...prev.app, logoUrl: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://example.com/logo.png"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            saveConfiguration('app', config.app);
            saveConfiguration('llmSettings', config.llmSettings);
          }}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save General Settings'}
        </button>
      </div>
    </div>
  );

  const renderDatabaseSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Database Configuration</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Host
          </label>
          <input
            type="text"
            value={config.database?.host || 'localhost'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, host: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Port
          </label>
          <input
            type="number"
            value={config.database?.port || 5432}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, port: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Database Name
          </label>
          <input
            type="text"
            value={config.database?.name || 'asemb'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, name: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Username
          </label>
          <input
            type="text"
            value={config.database?.user || 'postgres'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, user: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            type="password"
            value={config.database?.password || ''}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, password: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Connections
          </label>
          <input
            type="number"
            value={config.database?.maxConnections || 20}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, maxConnections: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="db-ssl"
            checked={config.database?.ssl || false}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              database: { ...prev.database, ssl: e.target.checked }
            }))}
            className="mr-2"
          />
          <label htmlFor="db-ssl" className="text-sm text-gray-700">
            Use SSL
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => saveConfiguration('database', config.database)}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Database Settings'}
        </button>
      </div>
    </div>
  );

  const renderRedisSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Redis Configuration</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Host
          </label>
          <input
            type="text"
            value={config.redis?.host || 'localhost'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              redis: { ...prev.redis, host: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Port
          </label>
          <input
            type="number"
            value={config.redis?.port || 6379}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              redis: { ...prev.redis, port: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <input
            type="password"
            value={config.redis?.password || ''}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              redis: { ...prev.redis, password: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Database
          </label>
          <input
            type="number"
            value={config.redis?.db || 2}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              redis: { ...prev.redis, db: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => saveConfiguration('redis', config.redis)}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Redis Settings'}
        </button>
      </div>
    </div>
  );

  const renderAPISettings = () => (
    <div className="space-y-8">
      <h3 className="text-lg font-semibold text-gray-900">API Keys Configuration</h3>

      {/* OpenAI Settings */}
      <div className="border rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4">OpenAI</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={config.openai?.apiKey || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  openai: { ...prev.openai, apiKey: e.target.value }
                }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sk-..."
              />
              <button
                onClick={() => testAPIKey('openai', config.openai?.apiKey)}
                disabled={!config.openai?.apiKey}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Test
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={config.openai?.model || 'gpt-4o-mini'}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  openai: { ...prev.openai, model: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Embedding Model
              </label>
              <select
                value={config.openai?.embeddingModel || 'text-embedding-3-small'}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  openai: { ...prev.openai, embeddingModel: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="text-embedding-3-small">text-embedding-3-small</option>
                <option value="text-embedding-3-large">text-embedding-3-large</option>
                <option value="text-embedding-ada-002">text-embedding-ada-002</option>
              </select>
            </div>
          </div>
        </div>
      </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model
            </label>
            <select
              value={config.google?.model || 'gemini-pro'}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                google: { ...prev.google, model: e.target.value }
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gemini-pro">Gemini Pro</option>
              <option value="gemini-1.5-flash-latest">Gemini 1.5 Flash</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={config.google?.apiKey || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  google: { ...prev.google, apiKey: e.target.value }
                }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="AIza..."
              />
              <button
                onClick={() => testAPIKey('google', config.google?.apiKey, config.google?.model || 'gemini-pro')}
                disabled={!config.google?.apiKey}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Test
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Anthropic Settings */}
      <div className="border rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4">Anthropic (Claude)</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={config.anthropic?.apiKey || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  anthropic: { ...prev.anthropic, apiKey: e.target.value }
                }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sk-ant-..."
              />
              <button
                onClick={() => testAPIKey('anthropic', config.anthropic?.apiKey)}
                disabled={!config.anthropic?.apiKey}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Test
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DeepSeek Settings */}
      <div className="border rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4">DeepSeek AI</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={config.deepseek?.apiKey || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  deepseek: { ...prev.deepseek, apiKey: e.target.value }
                }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sk-..."
              />
              <button
                onClick={() => testAPIKey('deepseek', config.deepseek?.apiKey)}
                disabled={!config.deepseek?.apiKey}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Test
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base URL
              </label>
              <input
                type="text"
                value={config.deepseek?.baseUrl || 'https://api.deepseek.com'}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  deepseek: { ...prev.deepseek, baseUrl: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://api.deepseek.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={config.deepseek?.model || 'deepseek-chat'}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  deepseek: { ...prev.deepseek, model: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="deepseek-chat">DeepSeek Chat</option>
                <option value="deepseek-coder">DeepSeek Coder</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            saveConfiguration('openai', config.openai);
            saveConfiguration('google', config.google);
            saveConfiguration('anthropic', config.anthropic);
            saveConfiguration('deepseek', config.deepseek);
          }}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save API Keys'}
        </button>
      </div>
    </div>
  );

  const renderEmbeddingSettings = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Embedding Configuration</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Embedding Provider
          </label>
          <select
            value={config.embeddings?.provider || 'openai'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              embeddings: { ...prev.embeddings, provider: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
            <option value="huggingface">HuggingFace</option>
            <option value="ollama">Ollama (Local)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Model
          </label>
          <input
            type="text"
            value={config.embeddings?.model || 'text-embedding-3-small'}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              embeddings: { ...prev.embeddings, model: e.target.value }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Batch Size
          </label>
          <input
            type="number"
            value={config.embeddings?.batchSize || 100}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              embeddings: { ...prev.embeddings, batchSize: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Tokens
          </label>
          <input
            type="number"
            value={config.embeddings?.maxTokens || 8192}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              embeddings: { ...prev.embeddings, maxTokens: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dimension
          </label>
          <input
            type="number"
            value={config.embeddings?.dimension || 1536}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              embeddings: { ...prev.embeddings, dimension: parseInt(e.target.value) }
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="embed-enabled"
            checked={config.embeddings?.enabled !== false}
            onChange={(e) => setConfig(prev => ({
              ...prev,
              embeddings: { ...prev.embeddings, enabled: e.target.checked }
            }))}
            className="mr-2"
          />
          <label htmlFor="embed-enabled" className="text-sm text-gray-700">
            Enable Embeddings
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => saveConfiguration('embeddings', config.embeddings)}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Embedding Settings'}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading settings...</div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex space-x-1 border-b">
          {[
            { id: 'general', label: 'General' },
            { id: 'database', label: 'Database' },
            { id: 'redis', label: 'Redis' },
            { id: 'api', label: 'API Keys' },
            { id: 'embeddings', label: 'Embeddings' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`px-4 py-2 font-medium text-sm border-b-2 ${
                activeSection === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          {activeSection === 'general' && renderGeneralSettings()}
          {activeSection === 'database' && renderDatabaseSettings()}
          {activeSection === 'redis' && renderRedisSettings()}
          {activeSection === 'api' && renderAPISettings()}
          {activeSection === 'embeddings' && renderEmbeddingSettings()}
        </div>
      </div>

      {/* Toast Notifications */}
      <Toast.Provider swipeDirection="right">
        {toasts.map((toast) => (
          <Toast.Root
            key={toast.id}
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg flex items-center space-x-3 min-w-[300px] transform transition-all duration-300 ease-in-out ${
              toast.type === 'success' ? 'bg-green-500 text-white' :
              toast.type === 'error' ? 'bg-red-500 text-white' :
              'bg-blue-500 text-white'
            }`}
          >
            <Toast.Title className="flex items-center space-x-2 font-medium">
              {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
              {toast.type === 'error' && <XCircle className="w-5 h-5" />}
              {toast.type === 'info' && <Info className="w-5 h-5" />}
              <span>{toast.message}</span>
            </Toast.Title>
            <Toast.Action
              altText="Close"
              className="ml-auto text-white hover:opacity-80"
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            >
              ×
            </Toast.Action>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-4 right-4" />
      </Toast.Provider>
    </>
  );
};

export default SettingsDashboard;