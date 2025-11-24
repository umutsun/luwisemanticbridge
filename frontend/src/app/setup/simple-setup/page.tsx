'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api.config';
import { useTranslation } from 'react-i18next';

export default function SimpleSetupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fromLogin, setFromLogin] = useState(false);

  // Configuration data
  const [config, setConfig] = useState({
    database: {
      host: 'localhost',
      port: '5432',
      name: '',
      user: '',
      password: ''
    },
    admin: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: ''
    },
    apiKeys: {
      openai: '',
      claude: '',
      gemini: '',
      deepseek: ''
    },
    site: {
      title: 'Luwi Semantic Bridge',
      description: 'AI-Powered Knowledge Management System',
      logoUrl: ''
    }
  });

  // Check if user came from login and get project info
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const from = urlParams.get('from');
    setFromLogin(from === 'login');

    fetch(`${API_BASE_URL}/api/v2/setup/status`)
      .then(res => res.json())
      .then(data => {
        // If setup is truly complete (database + admin user), redirect to login
        if (data.setupComplete && data.databaseConnected && data.adminUserExists) {
          console.log('Setup already completed with admin user. Redirecting to login...');
          router.push('/login');
          return;
        }

        if (!data.setupComplete) {
          // Pre-fill database info from environment
          setConfig(prev => ({
            ...prev,
            database: {
              ...prev.database,
              name: data.project?.dbName || '',
              user: data.project?.dbUser || ''
            },
            site: {
              title: data.project?.title || 'Luwi Semantic Bridge',
              description: data.project?.description || 'AI-Powered Knowledge Management System',
              logoUrl: ''
            }
          }));
        }
      });
  }, [router]);

  const saveAndContinue = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/setup/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('setup.errors.configurationSavedSuccessfully'));
        setTimeout(async () => {
          if (currentStep < 4) {
            setCurrentStep(currentStep + 1);
          } else {
            // Complete setup
            await fetch(`${API_BASE_URL}/api/v2/setup/complete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            router.push('/login');
          }
        }, 1000);
      } else {
        setError(data.error || t('setup.errors.failedToSaveConfiguration'));
      }
    } catch (err) {
      setError(t('setup.errors.failedToSaveConfiguration'));
    }

    setLoading(false);
  };

  const testConnection = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/setup/test-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.database)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('setup.errors.databaseConnectionSuccessful'));
        setTimeout(() => setCurrentStep(2), 1500);
      } else {
        setError(data.error || t('setup.errors.databaseConnectionFailed'));
      }
    } catch (err) {
      setError(t('setup.errors.failedToConnectToDatabase'));
    }

    setLoading(false);
  };

  const renderDatabaseStep = () => (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.simpleSetup.welcome')}</h1>
        <p className="text-gray-600">{t('setup.simpleSetup.configureDatabase')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.databaseHost')}</label>
          <input
            type="text"
            value={config.database.host}
            onChange={(e) => setConfig({ ...config, database: { ...config.database, host: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.databasePort')}</label>
          <input
            type="text"
            value={config.database.port}
            onChange={(e) => setConfig({ ...config, database: { ...config.database, port: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.databaseName')}</label>
          <input
            type="text"
            value={config.database.name}
            onChange={(e) => setConfig({ ...config, database: { ...config.database, name: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="lsemb_luwi_dev"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.databaseUser')}</label>
          <input
            type="text"
            value={config.database.user}
            onChange={(e) => setConfig({ ...config, database: { ...config.database, user: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.databasePassword')}</label>
          <input
            type="password"
            value={config.database.password}
            onChange={(e) => setConfig({ ...config, database: { ...config.database, password: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={t('setup.simpleSetup.databasePasswordPlaceholder')}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      <button
        onClick={testConnection}
        disabled={loading || !config.database.name || !config.database.password}
        className="mt-6 w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {loading ? t('setup.simpleSetup.testing') : t('setup.simpleSetup.testConnection')}
      </button>
    </div>
  );

  const renderSiteStep = () => (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('setup.simpleSetup.siteConfiguration')}</h2>
        <p className="text-gray-600">{t('setup.simpleSetup.customizeSiteSettings')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.siteTitle')}</label>
          <input
            type="text"
            value={config.site.title}
            onChange={(e) => setConfig({ ...config, site: { ...config.site, title: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.siteDescription')}</label>
          <textarea
            value={config.site.description}
            onChange={(e) => setConfig({ ...config, site: { ...config.site, description: e.target.value } })}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.logoUrlOptional')}</label>
          <input
            type="url"
            value={config.site.logoUrl}
            onChange={(e) => setConfig({ ...config, site: { ...config.site, logoUrl: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={t('setup.simpleSetup.logoUrlPlaceholder')}
          />
        </div>
      </div>

      <div className="flex gap-4 mt-8">
        <button
          onClick={() => setCurrentStep(1)}
          className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
        >
          {t('setup.simpleSetup.back')}
        </button>
        <button
          onClick={saveAndContinue}
          disabled={loading}
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? t('setup.simpleSetup.saving') : t('setup.simpleSetup.continue')}
        </button>
      </div>
    </div>
  );

  const renderAdminStep = () => (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('setup.simpleSetup.createAdminAccount')}</h2>
        <p className="text-gray-600">{t('setup.simpleSetup.setupAdministratorAccount')}</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.firstName')}</label>
            <input
              type="text"
              value={config.admin.firstName}
              onChange={(e) => setConfig({ ...config, admin: { ...config.admin, firstName: e.target.value } })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.lastName')}</label>
            <input
              type="text"
              value={config.admin.lastName}
              onChange={(e) => setConfig({ ...config, admin: { ...config.admin, lastName: e.target.value } })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.email')}</label>
          <input
            type="email"
            value={config.admin.email}
            onChange={(e) => setConfig({ ...config, admin: { ...config.admin, email: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.password')}</label>
          <input
            type="password"
            value={config.admin.password}
            onChange={(e) => setConfig({ ...config, admin: { ...config.admin, password: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.confirmPassword')}</label>
          <input
            type="password"
            value={config.admin.confirmPassword}
            onChange={(e) => setConfig({ ...config, admin: { ...config.admin, confirmPassword: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4 mt-8">
        <button
          onClick={() => setCurrentStep(2)}
          className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
        >
          {t('setup.simpleSetup.back')}
        </button>
        <button
          onClick={saveAndContinue}
          disabled={loading || !config.admin.email || !config.admin.password || config.admin.password !== config.admin.confirmPassword}
          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? t('setup.simpleSetup.creating') : t('setup.simpleSetup.createAdmin')}
        </button>
      </div>
    </div>
  );

  const renderAPIStep = () => (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('setup.simpleSetup.configureAIProviders')}</h2>
        <p className="text-gray-600">{t('setup.simpleSetup.addAPIKeysOptional')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.openAIAPIKey')}</label>
          <input
            type="password"
            value={config.apiKeys.openai}
            onChange={(e) => setConfig({ ...config, apiKeys: { ...config.apiKeys, openai: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={t('setup.simpleSetup.openAIPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.claudeAPIKey')}</label>
          <input
            type="password"
            value={config.apiKeys.claude}
            onChange={(e) => setConfig({ ...config, apiKeys: { ...config.apiKeys, claude: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={t('setup.simpleSetup.claudePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.googleGeminiAPIKey')}</label>
          <input
            type="password"
            value={config.apiKeys.gemini}
            onChange={(e) => setConfig({ ...config, apiKeys: { ...config.apiKeys, gemini: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={t('setup.simpleSetup.geminiPlaceholder')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.simpleSetup.deepSeekAPIKey')}</label>
          <input
            type="password"
            value={config.apiKeys.deepseek}
            onChange={(e) => setConfig({ ...config, apiKeys: { ...config.apiKeys, deepseek: e.target.value } })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder={t('setup.simpleSetup.deepSeekPlaceholder')}
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <p className="text-sm text-blue-800">
          <strong>{t('setup.simpleSetup.note')}</strong> {t('setup.simpleSetup.configureAPILater')}
        </p>
      </div>

      <div className="flex gap-4 mt-8">
        <button
          onClick={() => setCurrentStep(3)}
          className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300"
        >
          {t('setup.simpleSetup.back')}
        </button>
        <button
          onClick={saveAndContinue}
          disabled={loading}
          className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700"
        >
          {loading ? t('setup.simpleSetup.launching') : t('setup.simpleSetup.launchApplication')}
        </button>
      </div>
    </div>
  );

  const renderFinalStep = () => (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
      <div className="mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.simpleSetup.setupComplete')}</h2>
        <p className="text-gray-600">{t('setup.simpleSetup.systemReady')}</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
        <h3 className="font-semibold mb-2">{t('setup.simpleSetup.nextSteps')}</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>{t('setup.simpleSetup.loginWithAdmin')}</li>
          <li>{t('setup.simpleSetup.configureAIProvidersSettings')}</li>
          <li>{t('setup.simpleSetup.uploadDocuments')}</li>
          <li>{t('setup.simpleSetup.startChatting')}</li>
        </ol>
      </div>

      <button
        onClick={() => {
          if (fromLogin) {
            router.push('/login');
          } else {
            router.push('/login');
          }
        }}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700"
      >
        {fromLogin ? t('setup.simpleSetup.returnToLogin') : t('setup.simpleSetup.goToLogin')}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-2xl px-4">
        {currentStep === 1 && renderDatabaseStep()}
        {currentStep === 2 && renderSiteStep()}
        {currentStep === 3 && renderAdminStep()}
        {currentStep === 4 && renderAPIStep()}
        {currentStep === 5 && renderFinalStep()}
      </div>
    </div>
  );
}