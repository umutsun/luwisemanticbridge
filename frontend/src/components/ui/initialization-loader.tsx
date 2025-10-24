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

  // Add CSS for cube animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes rotateCube {
        0% { transform: rotateX(0deg) rotateY(0deg); }
        100% { transform: rotateX(360deg) rotateY(360deg); }
      }
      @keyframes cubeGlow {
        0% {
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.6),
                      0 0 20px rgba(99, 102, 241, 0.4),
                      inset 0 0 10px rgba(99, 102, 241, 0.1);
        }
        100% {
          box-shadow: 0 0 20px rgba(139, 92, 246, 0.8),
                      0 0 30px rgba(139, 92, 246, 0.6),
                      inset 0 0 15px rgba(139, 92, 246, 0.2);
        }
      }
      .cube-face {
        animation: cubeGlow 4s ease-in-out infinite alternate;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const updateStep = (steps: InitializationStep[], id: string, status: InitializationStep['status']) => {
    return steps.map(step => step.id === id ? { ...step, status } : step);
  };

  const allComplete = steps.every(step => step.status === 'complete');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Title - 3D Cube */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            {/* 3D Cube Container */}
            <div className="relative w-10 h-10" style={{ perspective: '1000px' }}>
              <div className="absolute w-full h-full" style={{
                transformStyle: 'preserve-3d',
                animation: 'rotateCube 8s linear infinite'
              }}>
                {/* Front Face */}
                <div className="absolute w-full h-full cube-face" style={{
                  transform: 'translateZ(20px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(99, 102, 241, 0.6)',
                  backdropFilter: 'blur(5px)'
                }} />
                {/* Back Face */}
                <div className="absolute w-full h-full cube-face" style={{
                  transform: 'rotateY(180deg) translateZ(20px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(99, 102, 241, 0.6)',
                  backdropFilter: 'blur(5px)'
                }} />
                {/* Right Face */}
                <div className="absolute w-full h-full cube-face" style={{
                  transform: 'rotateY(90deg) translateZ(20px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(99, 102, 241, 0.6)',
                  backdropFilter: 'blur(5px)'
                }} />
                {/* Left Face */}
                <div className="absolute w-full h-full cube-face" style={{
                  transform: 'rotateY(-90deg) translateZ(20px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(99, 102, 241, 0.6)',
                  backdropFilter: 'blur(5px)'
                }} />
                {/* Top Face */}
                <div className="absolute w-full h-full cube-face" style={{
                  transform: 'rotateX(90deg) translateZ(20px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(99, 102, 241, 0.6)',
                  backdropFilter: 'blur(5px)'
                }} />
                {/* Bottom Face */}
                <div className="absolute w-full h-full cube-face" style={{
                  transform: 'rotateX(-90deg) translateZ(20px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                  border: '1px solid rgba(99, 102, 241, 0.6)',
                  backdropFilter: 'blur(5px)'
                }} />
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Luwi Semantic Bridge v1.0.0
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