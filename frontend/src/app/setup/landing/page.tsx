'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/config/api.config';

export default function SetupLandingPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [projectInfo, setProjectInfo] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [fromLogin, setFromLogin] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Check if user came from login page
    const urlParams = new URLSearchParams(window.location.search);
    const from = urlParams.get('from');
    setFromLogin(from === 'login');

    // Check setup status
    fetch(`${API_BASE_URL}/api/v2/setup/status`)
      .then(res => res.json())
      .then(data => {
        setProjectInfo(data.project);
        setIsChecking(false);

        // If setup is complete, redirect to login
        if (data.setupComplete) {
          const message = fromLogin
            ? "Sistem zaten yapılandırılmış. Login sayfasına yönlendiriliyorsunuz..."
            : "Sistem zaten yapılandırılmış. Login sayfasına yönlendiriliyorsunuz...";

          console.log(message);

          setTimeout(() => {
            if (fromLogin) {
              router.push('/login');
            } else {
              router.push('/login');
            }
          }, fromLogin ? 1000 : 2000);
        }
      })
      .catch(error => {
        console.error('Setup status check failed:', error);
        setIsChecking(false);
        // If status check fails, show setup options anyway
      });
  }, [router, fromLogin]);

  const handleStartSetup = () => {
    router.push('/setup/simple-setup');
  };

  const handleMultiProject = () => {
    router.push('/install');
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Checking setup status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className={`${mounted ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-900 rounded"></div>
            <span className="text-xl font-light text-gray-900">Luwi</span>
          </div>
          <div className="text-sm text-gray-500">
            Setup Wizard
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className={`${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} transition-all duration-700`}>
          <div className="text-center mb-20">
            {fromLogin ? (
              <div className="mb-8 p-6 border border-gray-200 rounded-lg bg-gray-50 max-w-lg mx-auto">
                <svg className="w-12 h-12 text-amber-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <h2 className="text-2xl font-light text-gray-900 mb-2">Configuration Required</h2>
                <p className="text-gray-600 mb-4">
                  System configuration is incomplete or missing
                </p>
                <p className="text-sm text-gray-500">
                  Please complete the setup process below to access the system
                </p>
              </div>
            ) : (
              <>
                <h1 className="text-5xl md:text-6xl font-thin text-gray-900 mb-6">
                  Luwi Semantic Bridge
                </h1>

                <p className="text-xl text-gray-500 mb-12 leading-relaxed max-w-2xl mx-auto">
                  Configure your AI-powered knowledge management system
                </p>

                {projectInfo && (
                  <div className="inline-block border border-gray-200 rounded-full px-6 py-3 mb-12">
                    <span className="text-sm text-gray-600">
                      Project: <span className="text-gray-900 font-medium">{projectInfo.name}</span>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Setup Options */}
          <div className="space-y-6 mb-20">
            {/* Quick Setup */}
            <div className={`${mounted ? 'opacity-100' : 'opacity-0'} transition-all duration-700 delay-200`}>
              <div className="border border-gray-200 rounded-lg p-8 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-light text-gray-900 mb-2">Quick Setup</h2>
                    <p className="text-gray-600 max-w-md">
                      Configure your single-project deployment
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>

                <ul className="space-y-3 mb-8 text-sm text-gray-600">
                  <li className="flex items-center">
                    <svg className="w-4 h-4 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    5-step guided setup
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Automatic database configuration
                  </li>
                  <li className="flex items-center">
                    <svg className="w-4 h-4 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Ready in minutes
                  </li>
                </ul>

                <button
                  onClick={handleStartSetup}
                  className="w-full bg-gray-900 text-white py-3 px-6 rounded hover:bg-gray-800 transition-colors"
                >
                  Start Quick Setup
                </button>
              </div>
            </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-12 mb-20">
            <div className={`${mounted ? 'opacity-100' : 'opacity-0'} transition-all duration-700 delay-400 text-center`}>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-light text-gray-900 mb-2">Easy Setup</h3>
              <p className="text-sm text-gray-600">Step-by-step configuration wizard</p>
            </div>

            <div className={`${mounted ? 'opacity-100' : 'opacity-0'} transition-all duration-700 delay-500 text-center`}>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-light text-gray-900 mb-2">Secure</h3>
              <p className="text-sm text-gray-600">Your data is encrypted and protected</p>
            </div>

            <div className={`${mounted ? 'opacity-100' : 'opacity-0'} transition-all duration-700 delay-600 text-center`}>
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-light text-gray-900 mb-2">Lightning Fast</h3>
              <p className="text-sm text-gray-600">Instant search and retrieval</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`${mounted ? 'opacity-100' : 'opacity-0'} transition-opacity duration-700 delay-800`}>
        <div className="max-w-6xl mx-auto px-6 py-8 border-t border-gray-200">
          <p className="text-center text-sm text-gray-500">
            luwi.dev
          </p>
        </div>
      </footer>
    </div>
  );
}