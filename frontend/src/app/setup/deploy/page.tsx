'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api.config';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle, Loader2, Eye, EyeOff, Shield, Database, Key, User, ArrowRight, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function DeployPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Form states
  const [currentStep, setCurrentStep] = useState('check'); // check, env, admin, llm, settings, complete
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [defaultSettings, setDefaultSettings] = useState<Record<string, unknown> | null>(null);
  const [editSettings, setEditSettings] = useState(false);

  // Environment data
  const [envData, setEnvData] = useState({
    configured: false,
    exists: false,
    vars: {},
    missing: []
  });

  // Form data
  const [envVars, setEnvVars] = useState({
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: '',
    POSTGRES_USER: '',
    POSTGRES_PASSWORD: '',
    SITE_TITLE: 'Luwi Semantic Bridge',
    SITE_DESCRIPTION: 'AI-Powered Knowledge Management System'
  });

  const [admin, setAdmin] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [llmConfig, setLlmConfig] = useState({
    provider: 'openai',
    apiKey: '',
    isValid: false,
    validating: false
  });

  useEffect(() => {
    setMounted(true);
    checkDeploymentStatus();
  }, []);

  const checkDeploymentStatus = async () => {
    try {
      // First check if admin already exists
      const adminResponse = await fetch(`${API_BASE_URL}/api/v2/deployment/check-admin`);
      const adminData = await adminResponse.json();

      if (adminData.adminExists && adminData.databaseConnected && adminData.envConfigured) {
        // Everything is set up, redirect to login
        router.push('/login');
        return;
      }

      // If not fully configured, check environment
      checkEnvironment();
    } catch (error) {
      console.error('Deployment status check failed:', error);
      checkEnvironment();
    }
  };

  const checkEnvironment = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/read-env`, {
        method: 'POST'
      });
      const data = await response.json();

      setEnvData(data);

      if (data.configured) {
        setEnvVars(data.envVars);
        setCurrentStep('admin');
      }
    } catch (error) {
      setError(t('setup.errors.failedToCheckEnvironmentConfiguration'));
    }
  };

  const validateLLMKey = async () => {
    if (!llmConfig.apiKey) {
      setError(t('setup.errors.apiKeyIsRequired'));
      return;
    }

    setLlmConfig(prev => ({ ...prev, validating: true }));
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/validate-llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: llmConfig.provider,
          apiKey: llmConfig.apiKey
        })
      });

      const data = await response.json();

      if (data.valid) {
        setLlmConfig(prev => ({ ...prev, isValid: true }));
        setSuccess(t('setup.errors.apiKeyValidatedSuccessfully'));
      } else {
        setLlmConfig(prev => ({ ...prev, isValid: false }));
        setError(data.error || t('setup.errors.invalidAPIKey'));
      }
    } catch (error) {
      setError(t('setup.errors.failedToValidateAPIKey'));
    }

    setLlmConfig(prev => ({ ...prev, validating: false }));
  };

  const completeDeployment = async () => {
    if (admin.password !== admin.confirmPassword) {
      setError(t('setup.errors.passwordsDoNotMatch'));
      return;
    }

    if (!llmConfig.isValid) {
      setError(t('setup.errors.pleaseValidateYourLLMAPIKey'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envVars,
          admin,
          llmProvider: llmConfig.provider,
          llmApiKey: llmConfig.apiKey
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(t('setup.errors.deploymentCompletedSuccessfully'));
        setCurrentStep('complete');

        // Auto-login after 2 seconds
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        setError(data.error || t('setup.errors.deploymentFailed'));
      }
    } catch (error) {
      setError(t('setup.errors.deploymentFailed'));
    }

    setLoading(false);
  };

  const renderCheckStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <Database className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.deploy.environmentCheck')}</h2>
          <p className="text-gray-600">{t('setup.deploy.checkingConfiguration')}</p>
        </div>

        {envData.exists ? (
          <div className="space-y-4">
            {envData.configured ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-green-800">{t('setup.deploy.environmentConfiguredSuccessfully')}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-amber-600 mr-2" />
                  <span className="text-amber-800">{t('setup.deploy.pleaseConfigure')}: {envData.missing.join(', ')}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-800">{t('setup.deploy.envFileNotFound')}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setCurrentStep('env')}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
        >
          {t('setup.deploy.configureEnvironment')}
          <ArrowRight className="w-5 h-5 ml-2" />
        </button>
      </div>
    </motion.div>
  );

  const renderEnvStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.deploy.environmentConfiguration')}</h2>
          <p className="text-gray-600">{t('setup.deploy.configureDatabaseAndSite')}</p>
        </div>

        <div className="space-y-6">
          <div className="border-b pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Database className="w-5 h-5 mr-2 text-blue-600" />
              {t('setup.deploy.databaseConfiguration')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.host')}</label>
                <input
                  type="text"
                  value={envVars.POSTGRES_HOST}
                  onChange={(e) => setEnvVars({ ...envVars, POSTGRES_HOST: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.port')}</label>
                <input
                  type="text"
                  value={envVars.POSTGRES_PORT}
                  onChange={(e) => setEnvVars({ ...envVars, POSTGRES_PORT: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.databaseName')}</label>
                <input
                  type="text"
                  value={envVars.POSTGRES_DB}
                  onChange={(e) => setEnvVars({ ...envVars, POSTGRES_DB: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={t('setup.deploy.databaseNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.user')}</label>
                <input
                  type="text"
                  value={envVars.POSTGRES_USER}
                  onChange={(e) => setEnvVars({ ...envVars, POSTGRES_USER: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.password')}</label>
                <input
                  type="password"
                  value={envVars.POSTGRES_PASSWORD}
                  onChange={(e) => setEnvVars({ ...envVars, POSTGRES_PASSWORD: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('setup.deploy.siteInformation')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.siteTitle')}</label>
                <input
                  type="text"
                  value={envVars.SITE_TITLE}
                  onChange={(e) => setEnvVars({ ...envVars, SITE_TITLE: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.description')}</label>
                <input
                  type="text"
                  value={envVars.SITE_DESCRIPTION}
                  onChange={(e) => setEnvVars({ ...envVars, SITE_DESCRIPTION: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentStep('check')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('setup.deploy.back')}
          </button>
          <button
            onClick={() => setCurrentStep('admin')}
            className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            {t('setup.deploy.next')}
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderAdminStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.deploy.createAdminAccount')}</h2>
          <p className="text-gray-600">{t('setup.deploy.setupAdministratorAccount')}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.firstName')}</label>
              <input
                type="text"
                value={admin.firstName}
                onChange={(e) => setAdmin({ ...admin, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.lastName')}</label>
              <input
                type="text"
                value={admin.lastName}
                onChange={(e) => setAdmin({ ...admin, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.email')}</label>
            <input
              type="email"
              value={admin.email}
              onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.password')}</label>
            <input
              type="password"
              value={admin.password}
              onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.confirmPassword')}</label>
            <input
              type="password"
              value={admin.confirmPassword}
              onChange={(e) => setAdmin({ ...admin, confirmPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentStep('env')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('setup.deploy.back')}
          </button>
          <button
            onClick={() => setCurrentStep('llm')}
            className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            {t('setup.deploy.next')}
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderLLMStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.deploy.configureAIProvider')}</h2>
          <p className="text-gray-600">{t('setup.deploy.selectAndConfigure')}</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('setup.deploy.aiProvider')}</label>
            <div className="grid grid-cols-3 gap-4">
              {['openai', 'claude', 'gemini'].map((provider) => (
                <button
                  key={provider}
                  onClick={() => setLlmConfig({ ...llmConfig, provider, isValid: false })}
                  className={`p-4 border-2 rounded-lg transition-all ${llmConfig.provider === provider
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                    }`}
                >
                  <div className="text-lg font-semibold capitalize">{provider}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {provider === 'openai' && t('setup.deploy.gptModels')}
                    {provider === 'claude' && t('setup.deploy.claudeModels')}
                    {provider === 'gemini' && t('setup.deploy.geminiModels')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('setup.deploy.apiKey')}</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={llmConfig.apiKey}
                onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value, isValid: false })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder={t('setup.deploy.enterAPIKey')}
              />
              <button
                onClick={validateLLMKey}
                disabled={llmConfig.validating || !llmConfig.apiKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
              >
                {llmConfig.validating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  t('setup.deploy.validate')
                )}
              </button>
            </div>
            {llmConfig.isValid && (
              <div className="mt-2 p-2 bg-green-50 text-green-800 rounded-lg flex items-center">
                <Check className="w-4 h-4 mr-2" />
                {t('setup.deploy.apiKeyValidatedSuccessfully')}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mt-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentStep('admin')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('setup.deploy.back')}
          </button>
          <button
            onClick={() => {
              // Generate default settings
              const settings = {
                app: {
                  name: envVars.SITE_TITLE || 'Luwi Semantic Bridge',
                  description: envVars.SITE_DESCRIPTION || 'AI-Powered Knowledge Management System',
                  locale: 'tr'
                },
                llmSettings: {
                  activeProvider: llmConfig.provider,
                  temperature: 0.7,
                  maxTokens: 4096,
                  language: 'tr'
                },
                [llmConfig.provider]: {
                  apiKey: llmConfig.apiKey
                }
              };
              setDefaultSettings(settings);
              setCurrentStep('settings');
            }}
            disabled={!llmConfig.isValid}
            className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {t('setup.deploy.reviewAndEdit')}
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  const renderSettingsStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.deploy.defaultSettings')}</h2>
          <p className="text-gray-600">{t('setup.deploy.reviewAndEdit')}</p>
        </div>

        <div className="mb-6">
          <button
            onClick={() => setEditSettings(!editSettings)}
            className="text-blue-600 hover:text-blue-700 flex items-center"
          >
            {editSettings ? t('setup.deploy.cancelEdit') : t('setup.deploy.editSettings')}
            <ArrowRight className={`w-4 h-4 ml-2 transform ${editSettings ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-6">
          <pre className="text-sm overflow-auto">
            {JSON.stringify(defaultSettings, null, 2)}
          </pre>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mt-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentStep('llm')}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('setup.deploy.back')}
          </button>
          <div className="space-x-4">
            <button
              onClick={completeDeployment}
              disabled={loading}
              className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              {t('setup.deploy.useDefaultSettings')}
            </button>
            <button
              onClick={() => {
                // Save edited settings and continue
                completeDeployment();
              }}
              disabled={loading}
              className="bg-green-600 text-white py-2 px-6 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {t('setup.deploy.deploying')}
                </>
              ) : (
                <>
                  {t('setup.deploy.deployWithSettings')}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderCompleteStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto text-center"
    >
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{t('setup.deploy.deploymentComplete')}</h2>
          <p className="text-gray-600">{t('setup.deploy.systemReadyRedirecting')}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-6 text-left">
          <h3 className="font-semibold mb-2">{t('setup.deploy.whatsNext')}</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• {t('setup.deploy.loginWithAdminCredentials')}</li>
            <li>• {t('setup.deploy.accessDashboard')}</li>
            <li>• {t('setup.deploy.uploadDocuments')}</li>
            <li>• {t('setup.deploy.startChatting')}</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-6xl mx-auto px-4">
        {/* Progress indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-center space-x-2 md:space-x-8">
            {[
              { key: 'check', label: t('setup.deploy.check'), icon: Database },
              { key: 'env', label: t('setup.deploy.environment'), icon: Shield },
              { key: 'admin', label: t('setup.deploy.admin'), icon: User },
              { key: 'llm', label: t('setup.deploy.aiSetup'), icon: Key },
              { key: 'settings', label: t('setup.deploy.settings'), icon: Settings },
              { key: 'complete', label: t('setup.deploy.complete'), icon: Check }
            ].map((step, index) => (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${currentStep === step.key || (step.key === 'complete' && currentStep === 'complete')
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-300 text-gray-600'
                    }`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs mt-2 hidden md:block">{step.label}</span>
                </div>
                {index < 5 && (
                  <div className={`w-8 md:w-16 h-1 mx-2 transition-colors ${['check', 'env', 'admin', 'llm', 'settings'].indexOf(currentStep) > index ? 'bg-blue-600' : 'bg-gray-300'
                    }`}></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Render current step */}
        <AnimatePresence mode="wait">
          {currentStep === 'check' && renderCheckStep()}
          {currentStep === 'env' && renderEnvStep()}
          {currentStep === 'admin' && renderAdminStep()}
          {currentStep === 'llm' && renderLLMStep()}
          {currentStep === 'settings' && renderSettingsStep()}
          {currentStep === 'complete' && renderCompleteStep()}
        </AnimatePresence>
      </div>
    </div>
  );
}