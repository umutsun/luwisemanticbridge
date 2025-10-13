'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api.config';

interface ConfigData {
  database: {
    host: string;
    port: string;
    name: string;
    user: string;
    password: string;
  };
  admin: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
  apiKeys: {
    openai: string;
    claude: string;
    gemini: string;
    deepseek: string;
  };
  site: {
    title: string;
    description: string;
    logoUrl: string;
  };
}

interface Project {
  domain: string;
  name: string;
  type: 'development' | 'customer';
  status: 'not-installed' | 'installing' | 'installed' | 'error';
  progress: number;
}

export default function InstallPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [projects, setProjects] = useState<Project[]>([
    { domain: 'lsemb.luwi.dev', name: 'lsemb', type: 'development', status: 'not-installed', progress: 0 },
    { domain: 'musavir.luwi.dev', name: 'musavir', type: 'customer', status: 'not-installed', progress: 0 },
    { domain: 'cocuk.luwi.dev', name: 'cocuk', type: 'customer', status: 'not-installed', progress: 0 },
    { domain: 'emlak.luwi.dev', name: 'emlak', type: 'customer', status: 'not-installed', progress: 0 }
  ]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>(['lsemb.luwi.dev']);
  const [globalSettings, setGlobalSettings] = useState({
    adminEmail: '',
    adminPassword: '',
    adminFirstName: '',
    adminLastName: '',
    dbHost: 'localhost',
    dbPort: '5432',
    dbAdminPassword: ''
  });
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    claude: '',
    gemini: '',
    deepseek: ''
  });
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const installProject = async (project: Project) => {
    addLog(`Starting installation for ${project.domain}...`);

    // Update project status
    setProjects(prev => prev.map(p =>
      p.domain === project.domain ? { ...p, status: 'installing', progress: 0 } : p
    ));

    try {
      // Step 1: Create project directory
      addLog(`Creating project directory for ${project.domain}`);
      await simulateProgress(project.domain, 20);

      // Step 2: Clone repository
      addLog(`Cloning repository for ${project.domain}`);
      await simulateProgress(project.domain, 40);

      // Step 3: Install dependencies
      addLog(`Installing dependencies for ${project.domain}`);
      await simulateProgress(project.domain, 60);

      // Step 4: Build frontend
      addLog(`Building frontend for ${project.domain}`);
      await simulateProgress(project.domain, 80);

      // Step 5: Setup database
      addLog(`Setting up database for ${project.domain}`);
      await simulateProgress(project.domain, 90);

      // Step 6: Start services
      addLog(`Starting services for ${project.domain}`);
      await simulateProgress(project.domain, 100);

      setProjects(prev => prev.map(p =>
        p.domain === project.domain ? { ...p, status: 'installed', progress: 100 } : p
      ));

      addLog(`✅ ${project.domain} installed successfully!`);
    } catch (error) {
      setProjects(prev => prev.map(p =>
        p.domain === project.domain ? { ...p, status: 'error', progress: 0 } : p
      ));
      addLog(`❌ Failed to install ${project.domain}: ${error}`);
    }
  };

  const simulateProgress = (domain: string, targetProgress: number) => {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        setProjects(prev => prev.map(p => {
          if (p.domain === domain && p.progress < targetProgress) {
            return { ...p, progress: p.progress + 10 };
          }
          return p;
        }));

        const project = projects.find(p => p.domain === domain);
        if (project && project.progress >= targetProgress) {
          clearInterval(interval);
          resolve(true);
        }
      }, 300);
    });
  };

  const startInstallation = async () => {
    setInstalling(true);
    setLogs([]);

    addLog('🚀 Starting installation process...');
    addLog(`Selected projects: ${selectedProjects.join(', ')}`);

    // Install selected projects
    for (const domain of selectedProjects) {
      const project = projects.find(p => p.domain === domain);
      if (project) {
        await installProject(project);
      }
    }

    addLog('🎉 Installation completed!');
    setInstalling(false);
  };

  const toggleProject = (domain: string) => {
    setSelectedProjects(prev =>
      prev.includes(domain)
        ? prev.filter(d => d !== domain)
        : [...prev, domain]
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold mb-6">Select Projects to Install</h2>
            <p className="text-gray-600 mb-8">Choose which projects you want to deploy. Each project will have its own database and configuration.</p>

            <div className="space-y-4 mb-8">
              {projects.map(project => (
                <div key={project.domain} className="border rounded-lg p-4 hover:bg-gray-50">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div className="flex items-center space-x-4">
                      <input
                        type="checkbox"
                        checked={selectedProjects.includes(project.domain)}
                        onChange={() => toggleProject(project.domain)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <div>
                        <div className="font-semibold">{project.domain}</div>
                        <div className="text-sm text-gray-500">
                          Project: {project.name} | Type: {project.type}
                        </div>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm ${
                      project.status === 'installed' ? 'bg-green-100 text-green-800' :
                      project.status === 'installing' ? 'bg-blue-100 text-blue-800' :
                      project.status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {project.status === 'installed' ? 'Installed' :
                       project.status === 'installing' ? 'Installing' :
                       project.status === 'error' ? 'Failed' :
                       'Not Installed'}
                    </div>
                  </label>

                  {project.status === 'installing' && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                      <div className="text-sm text-gray-600 mt-1">{project.progress}%</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setCurrentStep(2)}
              disabled={selectedProjects.length === 0}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Next: Configure Database ({selectedProjects.length} projects selected)
            </button>
          </div>
        );

      case 2:
        return (
          <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold mb-6">Database Configuration</h2>
            <p className="text-gray-600 mb-8">Configure the database settings for all projects.</p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Database Host</label>
                <input
                  type="text"
                  value={globalSettings.dbHost}
                  onChange={(e) => setGlobalSettings({...globalSettings, dbHost: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Database Port</label>
                <input
                  type="text"
                  value={globalSettings.dbPort}
                  onChange={(e) => setGlobalSettings({...globalSettings, dbPort: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Database Admin Password</label>
                <input
                  type="password"
                  value={globalSettings.dbAdminPassword}
                  onChange={(e) => setGlobalSettings({...globalSettings, dbAdminPassword: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter PostgreSQL admin password"
                />
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Admin User (for all projects)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                    <input
                      type="text"
                      value={globalSettings.adminFirstName}
                      onChange={(e) => setGlobalSettings({...globalSettings, adminFirstName: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                    <input
                      type="text"
                      value={globalSettings.adminLastName}
                      onChange={(e) => setGlobalSettings({...globalSettings, adminLastName: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={globalSettings.adminEmail}
                    onChange={(e) => setGlobalSettings({...globalSettings, adminEmail: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={globalSettings.adminPassword}
                    onChange={(e) => setGlobalSettings({...globalSettings, adminPassword: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-lg hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                disabled={!globalSettings.dbAdminPassword || !globalSettings.adminEmail || !globalSettings.adminPassword}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Next: API Keys
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold mb-6">API Configuration</h2>
            <p className="text-gray-600 mb-8">Configure AI provider API keys. These will be used for all selected projects.</p>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKeys.openai}
                  onChange={(e) => setApiKeys({...apiKeys, openai: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Claude API Key</label>
                <input
                  type="password"
                  value={apiKeys.claude}
                  onChange={(e) => setApiKeys({...apiKeys, claude: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-ant-..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Google Gemini API Key</label>
                <input
                  type="password"
                  value={apiKeys.gemini}
                  onChange={(e) => setApiKeys({...apiKeys, gemini: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="AIza..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">DeepSeek API Key</label>
                <input
                  type="password"
                  value={apiKeys.deepseek}
                  onChange={(e) => setApiKeys({...apiKeys, deepseek: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="sk-..."
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> At least one API key is required to enable chat functionality. You can add more keys later in the project settings.
              </p>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setCurrentStep(2)}
                className="flex-1 bg-gray-200 text-gray-800 py-3 px-6 rounded-lg hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={startInstallation}
                disabled={installing || (!apiKeys.openai && !apiKeys.claude && !apiKeys.gemini && !apiKeys.deepseek)}
                className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {installing ? 'Installing...' : 'Install Projects'}
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold mb-6">Installation Progress</h2>

            <div className="space-y-4 mb-8">
              {projects.map(project => (
                <div key={project.domain} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-semibold">{project.domain}</div>
                      <div className="text-sm text-gray-500">Project: {project.name}</div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm ${
                      project.status === 'installed' ? 'bg-green-100 text-green-800' :
                      project.status === 'installing' ? 'bg-blue-100 text-blue-800' :
                      project.status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {project.status === 'installed' ? '✅ Installed' :
                       project.status === 'installing' ? '🔄 Installing' :
                       project.status === 'error' ? '❌ Failed' :
                       '⏳ Pending'}
                    </div>
                  </div>

                  {project.status === 'installing' && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>

            {!installing && (
              <div className="mt-8 text-center">
                <h3 className="text-2xl font-bold text-green-600 mb-4">Installation Complete!</h3>
                <p className="text-gray-600 mb-6">
                  Your projects have been successfully installed. You can now access them:
                </p>
                <div className="space-y-2">
                  {projects.filter(p => p.status === 'installed').map(project => (
                    <a
                      key={project.domain}
                      href={`https://${project.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-blue-600 hover:text-blue-800 underline"
                    >
                      {project.domain}
                    </a>
                  ))}
                </div>
                <button
                  onClick={() => window.location.href = '/'}
                  className="mt-6 bg-blue-600 text-white py-3 px-8 rounded-lg hover:bg-blue-700"
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Luwi Semantic Bridge
          </h1>
          <p className="text-lg text-gray-600">
            Multi-Project Installation Wizard
          </p>
        </div>

        {/* Progress indicator */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                1
              </div>
              <span className="ml-3">Projects</span>
            </div>

            <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                2
              </div>
              <span className="ml-3">Database</span>
            </div>

            <div className={`flex items-center ${currentStep >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                3
              </div>
              <span className="ml-3">API Keys</span>
            </div>

            <div className={`flex items-center ${currentStep >= 4 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                currentStep >= 4 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                4
              </div>
              <span className="ml-3">Install</span>
            </div>
          </div>

          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {renderStep()}
      </div>
    </div>
  );
}