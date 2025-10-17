'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Zap, CheckCircle } from 'lucide-react';

interface InitializationStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'complete' | 'error';
}

export default function InitializationLoader() {
  const [steps, setSteps] = useState<InitializationStep[]>([
    { id: '1', label: 'Initializing system...', status: 'pending' },
    { id: '2', label: 'Loading configuration...', status: 'pending' },
    { id: '3', label: 'Establishing database connection...', status: 'pending' },
    { id: '4', label: 'Setting up authentication...', status: 'pending' },
    { id: '5', label: 'Initializing AI services...', status: 'pending' },
    { id: '6', label: 'Loading user interface...', status: 'pending' },
  ]);

  useEffect(() => {
    const timeouts = [
      setTimeout(() => setSteps(prev => updateStep(prev, '1', 'loading')), 0),
      setTimeout(() => setSteps(prev => updateStep(prev, '1', 'complete')), 500),
      setTimeout(() => setSteps(prev => updateStep(prev, '2', 'loading')), 800),
      setTimeout(() => setSteps(prev => updateStep(prev, '2', 'complete')), 1300),
      setTimeout(() => setSteps(prev => updateStep(prev, '3', 'loading')), 1600),
      setTimeout(() => setSteps(prev => updateStep(prev, '3', 'complete')), 2100),
      setTimeout(() => setSteps(prev => updateStep(prev, '4', 'loading')), 2400),
      setTimeout(() => setSteps(prev => updateStep(prev, '4', 'complete')), 2900),
      setTimeout(() => setSteps(prev => updateStep(prev, '5', 'loading')), 3200),
      setTimeout(() => setSteps(prev => updateStep(prev, '5', 'complete')), 3700),
      setTimeout(() => setSteps(prev => updateStep(prev, '6', 'loading')), 4000),
      setTimeout(() => setSteps(prev => updateStep(prev, '6', 'complete')), 4500),
    ];

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const updateStep = (steps: InitializationStep[], id: string, status: InitializationStep['status']) => {
    return steps.map(step => step.id === id ? { ...step, status } : step);
  };

  const allComplete = steps.every(step => step.status === 'complete');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-xl mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Luwi Semantic Bridge
          </h1>
          <p className="text-gray-400">
            Initializing your AI-powered platform
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-3 text-sm"
            >
              {step.status === 'pending' && (
                <div className="w-4 h-4 border border-gray-600 rounded-full" />
              )}
              {step.status === 'loading' && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {step.status === 'complete' && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              {step.status === 'error' && (
                <div className="w-4 h-4 bg-red-500 rounded-full" />
              )}
              <span
                className={
                  step.status === 'complete'
                    ? 'text-green-500'
                    : step.status === 'loading'
                    ? 'text-white'
                    : 'text-gray-500'
                }
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mt-6">
          <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500 ease-out"
              style={{
                width: `${(steps.filter(s => s.status === 'complete').length / steps.length) * 100}%`
              }}
            />
          </div>
        </div>

        {/* Complete Message */}
        {allComplete && (
          <div className="mt-6 text-center">
            <p className="text-green-500 text-sm">
              System ready! Redirecting...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}