'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api.config';

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Project info
  const [projectInfo, setProjectInfo] = useState<any>(null);

  // Database configuration
  const [dbConfig, setDbConfig] = useState({
    host: 'localhost',
    port: '5432',
    dbName: '',
    dbUser: '',
    dbPassword: ''
  });

  // Admin user
  const [adminUser, setAdminUser] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });

  // API Keys
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    claude: '',
    gemini: '',
    deepseek: ''
  });

  useEffect(() => {
    // Check if setup is already complete
    fetch(`${API_BASE_URL}/api/v2/setup/status`)
      .then(res => res.json())
      .then(data => {
        if (data.setupComplete) {
          router.push('/');
        } else {
          setProjectInfo(data.project);
          setDbConfig(prev => ({
            ...prev,
            dbName: data.project?.dbName || '',
            dbUser: data.project?.dbUser || ''
          }));
        }
      });
  }, [router]);

  const testDatabaseConnection = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/setup/test-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbConfig)
      });

      const data = await response.json();

      if (data.success) {
        setCurrentStep(3);
      } else {
        setError(data.error || 'Database connection failed');
      }
    } catch (err) {
      setError('Failed to connect to database');
    }

    setLoading(false);
  };

  const createAdminUser = async () => {
    if (adminUser.password !== adminUser.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/setup/create-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminUser)
      });

      const data = await response.json();

      if (data.success) {
        setCurrentStep(4);
      } else {
        setError(data.error || 'Failed to create admin user');
      }
    } catch (err) {
      setError('Failed to create admin user');
    }

    setLoading(false);
  };

  const saveApiKeys = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/setup/save-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiKeys)
      });

      const data = await response.json();

      if (data.success) {
        await fetch(`${API_BASE_URL}/api/v2/setup/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        router.push('/login');
      } else {
        setError(data.error || 'Failed to save API keys');
      }
    } catch (err) {
      setError('Failed to save API keys');
    }

    setLoading(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-6">Database Configuration</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Database Host</label>
                <input
                  type="text"
                  value={dbConfig.host}
                  onChange={(e) => setDbConfig({...dbConfig, host: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Database Port</label>
                <input
                  type="text"
                  value={dbConfig.port}
                  onChange={(e) => setDbConfig({...dbConfig, port: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Database Name</label>
                <input
                  type="text"
                  value={dbConfig.dbName}
                  onChange={(e) => setDbConfig({...dbConfig, dbName: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Database User</label>
                <input
                  type="text"
                  value={dbConfig.dbUser}
                  onChange={(e) => setDbConfig({...dbConfig, dbUser: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Database Password</label>
                <input
                  type="password"
                  value={dbConfig.dbPassword}
                  onChange={(e) => setDbConfig({...dbConfig, dbPassword: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter database password"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <button
              onClick={testDatabaseConnection}
              disabled={loading || !dbConfig.dbPassword}
              className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300"
            >
              {loading ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        );

      case 2:
        return (
          <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-6">Create Admin User</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    value={adminUser.firstName}
                    onChange={(e) => setAdminUser({...adminUser, firstName: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    value={adminUser.lastName}
                    onChange={(e) => setAdminUser({...adminUser, lastName: e.target.value})}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={adminUser.email}
                  onChange={(e) => setAdminUser({...adminUser, email: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  value={adminUser.password}
                  onChange={(e) => setAdminUser({...adminUser, password: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                <input
                  type="password"
                  value={adminUser.confirmPassword}
                  onChange={(e) => setAdminUser({...adminUser, confirmPassword: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <button
              onClick={createAdminUser}
              disabled={loading || !adminUser.email || !adminUser.password || !adminUser.firstName || !adminUser.lastName}
              className="mt-6 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300"
            >
              {loading ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        );

      case 3:
        return (
          <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-6">API Configuration</h2>
            <p className="text-gray-600 mb-6">Configure at least one AI provider to enable chat functionality</p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKeys.openai}
                  onChange={(e) => setApiKeys({...apiKeys, openai: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Claude API Key</label>
                <input
                  type="password"
                  value={apiKeys.claude}
                  onChange={(e) => setApiKeys({...apiKeys, claude: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="sk-ant-..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Google Gemini API Key</label>
                <input
                  type="password"
                  value={apiKeys.gemini}
                  onChange={(e) => setApiKeys({...apiKeys, gemini: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="AIza..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">DeepSeek API Key</label>
                <input
                  type="password"
                  value={apiKeys.deepseek}
                  onChange={(e) => setApiKeys({...apiKeys, deepseek: e.target.value})}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="sk-..."
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="mt-8 flex gap-4">
              <button
                onClick={saveApiKeys}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-300"
              >
                {loading ? 'Saving...' : 'Save & Complete'}
              </button>

              <button
                onClick={() => router.push('/login')}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300"
              >
                Skip for Now
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-4xl w-full p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Luwi Semantic Bridge
          </h1>
          <p className="text-lg text-gray-600">
            Setup Wizard - {projectInfo?.projectName}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="max-w-md mx-auto mb-8">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                1
              </div>
              <span className="ml-2 text-sm">Database</span>
            </div>

            <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                2
              </div>
              <span className="ml-2 text-sm">Admin</span>
            </div>

            <div className={`flex items-center ${currentStep >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                3
              </div>
              <span className="ml-2 text-sm">API Keys</span>
            </div>
          </div>

          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 3) * 100}%` }}
            />
          </div>
        </div>

        {renderStep()}
      </div>
    </div>
  );
}