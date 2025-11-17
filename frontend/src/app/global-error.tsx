'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            maxWidth: '28rem',
            width: '100%',
            background: 'rgba(30, 41, 59, 0.5)',
            backdropFilter: 'blur(20px)',
            padding: '2rem',
            borderRadius: '1rem',
            border: '1px solid rgba(71, 85, 105, 0.5)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              background: 'rgba(239, 68, 68, 0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '0.5rem'
            }}>
              Critical Error
            </h2>

            <p style={{
              color: '#94a3b8',
              marginBottom: '1.5rem'
            }}>
              A critical error occurred in the application. Please reload the page.
            </p>

            {process.env.NODE_ENV === 'development' && (
              <div style={{
                background: 'rgba(127, 29, 29, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1.5rem',
                textAlign: 'left'
              }}>
                <p style={{
                  fontSize: '0.75rem',
                  color: '#fca5a5',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all'
                }}>
                  {error.message}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  width: '100%',
                  background: 'linear-gradient(to right, #4f46e5, #7c3aed)',
                  color: 'white',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600'
                }}
              >
                Reload Page
              </button>

              <button
                onClick={() => window.location.href = '/dashboard'}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: '#cbd5e1',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #475569',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Go to Dashboard
              </button>
            </div>

            <p style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '1rem'
            }}>
              Error ID: {error.digest || 'N/A'}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
