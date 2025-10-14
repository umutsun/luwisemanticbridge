'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api.config';

export default function DeploymentSetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Configuration data
  const [envVars, setEnvVars] = useState({
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: '',
    POSTGRES_USER: '',
    POSTGRES_PASSWORD: '',
    SITE_TITLE: 'Luwi Semantic Bridge',
    SITE_DESCRIPTION: 'AI-Powered Knowledge Management System',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: ''
  });

  const [admin, setAdmin] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: ''
  });

  // Check deployment status on mount
  useEffect(() => {
    checkDeploymentStatus();
  }, []);

  const checkDeploymentStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/check-admin`);
      const data = await response.json();

      // If admin exists, redirect to login
      if (data.adminExists) {
        router.push('/login');
        return;
      }

      // Load current environment variables
      const envResponse = await fetch(`${API_BASE_URL}/api/v2/deployment/env-current`);
      const envData = await envResponse.json();

      if (envData.exists) {
        setEnvVars(prev => ({ ...prev, ...envData.vars }));
      }
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };

  const updateEnvironment = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/env-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ envVars })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Environment variables updated successfully');
        setTimeout(() => setCurrentStep(2), 1000);
      } else {
        setError('Failed to update environment variables');
      }
    } catch (error) {
      setError('Failed to update environment variables');
    }

    setLoading(false);
  };

  const initializeDefaults = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/init-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: envVars })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Default settings initialized');
        setTimeout(() => setCurrentStep(3), 1000);
      } else {
        setError('Failed to initialize default settings');
      }
    } catch (error) {
      setError('Failed to initialize default settings');
    }

    setLoading(false);
  };

  const createAdmin = async () => {
    if (admin.password !== admin.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/deployment/create-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Admin user created successfully');
        setTimeout(() => setCurrentStep(4), 1000);
      } else {
        setError(data.error || 'Failed to create admin user');
      }
    } catch (error) {
      setError('Failed to create admin user');
    }

    setLoading(false);
  };

  const renderEnvironmentStep = () => (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Step 1: Configure Environment</h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Database Host</label>
            <input
              type="text"
              value={envVars.POSTGRES_HOST}
              onChange={(e) => setEnvVars({...envVars, POSTGRES_HOST: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="localhost"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Database Port</label>
            <input
              type="text"
              value={envVars.POSTGRES_PORT}
              onChange={(e) => setEnvVars({...envVars, POSTGRES_PORT: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="5432"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Database Name</label>
            <input
              type="text"
              value={envVars.POSTGRES_DB}
              onChange={(e) => setEnvVars({...envVars, POSTGRES_DB: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="my_project_db"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Database User</label>
            <input
              type="text"
              value={envVars.POSTGRES_USER}
              onChange={(e) => setEnvVars({...envVars, POSTGRES_USER: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="postgres"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Database Password</label>
          <input
            type="password"
            value={envVars.POSTGRES_PASSWORD}
            onChange={(e) => setEnvVars({...envVars, POSTGRES_PASSWORD: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Your database password"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site Title</label>
            <input
              type="text"
              value={envVars.SITE_TITLE}
              onChange={(e) => setEnvVars({...envVars, SITE_TITLE: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site Description</label>
            <input
              type="text"
              value={envVars.SITE_DESCRIPTION}
              onChange={(e) => setEnvVars({...envVars, SITE_DESCRIPTION: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
            <input
              type="password"
              value={envVars.OPENAI_API_KEY}
              onChange={(e) => setEnvVars({...envVars, OPENAI_API_KEY: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="sk-..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anthropic API Key</label>
            <input
              type="password"
              value={envVars.ANTHROPIC_API_KEY}
              onChange={(e) => setEnvVars({...envVars, ANTHROPIC_API_KEY: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="sk-ant-..."
            />
          </div>
        </div>
      </div>

      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

      <div className="flex justify-end mt-6">
        <button
          onClick={updateEnvironment}
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update Environment'}
        </button>
      </div>
    </div>
  );

  const renderDefaultsStep = () => (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Step 2: Initialize Default Settings</h2>

      <div className="bg-gray-50 p-6 rounded-lg mb-6">
        <p className="text-gray-700 mb-4">
          The system will now initialize default settings based on your environment configuration.
        </p>
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
          <li>Application settings (name, description, etc.)</li>
          <li>Database connection settings</li>
          <li>AI provider configurations</li>
          <li>Default LLM settings</li>
        </ul>
      </div>

      {error && <div className="p-3 bg-red-100 text-red-700 rounded-lg mb-4">{error}</div>}
      {success && <div className="p-3 bg-green-100 text-green-700 rounded-lg mb-4">{success}</div>}

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(1)}
          className="bg-gray-200 text-gray-800 py-2 px-6 rounded-lg hover:bg-gray-300"
        >
          Back
        </button>
        <button
          onClick={initializeDefaults}
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Initializing...' : 'Initialize Settings'}
        </button>
      </div>
    </div>
  );

  const renderAdminStep = () => (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Step 3: Create Admin User</h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={admin.firstName}
              onChange={(e) => setAdmin({...admin, firstName: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              value={admin.lastName}
              onChange={(e) => setAdmin({...admin, lastName: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={admin.email}
            onChange={(e) => setAdmin({...admin, email: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={admin.password}
            onChange={(e) => setAdmin({...admin, password: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <input
            type="password"
            value={admin.confirmPassword}
            onChange={(e) => setAdmin({...admin, confirmPassword: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
      </div>

      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      {success && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg">{success}</div>}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => setCurrentStep(2)}
          className="bg-gray-200 text-gray-800 py-2 px-6 rounded-lg hover:bg-gray-300"
        >
          Back
        </button>
        <button
          onClick={createAdmin}
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Admin User'}
        </button>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg text-center">
      <div className="mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Deployment Complete!</h2>
        <p className="text-gray-600">Your project is ready to use.</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
        <h3 className="font-semibold mb-2">Next Steps:</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Login with your admin account</li>
          <li>Access the dashboard to configure additional settings</li>
          <li>Upload documents to build your knowledge base</li>
          <li>Start chatting with your AI assistant</li>
        </ol>
      </div>

      <button
        onClick={() => router.push('/login')}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700"
      >
        Go to Login
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  currentStep >= step ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}>
                  {step}
                </div>
                {step < 4 && <div className={`w-16 h-1 mx-2 ${
                  currentStep > step ? 'bg-blue-600' : 'bg-gray-300'
                }`}></div>}
              </div>
            ))}
          </div>
        </div>

        {/* Render current step */}
        {currentStep === 1 && renderEnvironmentStep()}
        {currentStep === 2 && renderDefaultsStep()}
        {currentStep === 3 && renderAdminStep()}
        {currentStep === 4 && renderCompleteStep()}
      </div>
    </div>
  );
}