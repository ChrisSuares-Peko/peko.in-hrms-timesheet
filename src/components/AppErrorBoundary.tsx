// PROTOTYPE-SETUP: app-wide safety net. Mounted outermost in main.tsx (outside the store, router, layout
// and header) so a render crash anywhere shows the real error instead of a blank page. Inline styles only:
// it must not depend on antd, Tailwind, Redux or the router, any of which may be what crashed.
import React from 'react';

import { ErrorBoundary, FallbackProps } from 'react-error-boundary';

const resetLocalData = () => {
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch {
        // storage may be blocked; reloading is still the right next step
    }
    window.location.assign('/');
};

function AppErrorFallback({ error }: FallbackProps) {
    const err = error instanceof Error ? error : new Error(String(error));
    return (
        <div
            role="alert"
            style={{
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                maxWidth: 760,
                margin: '48px auto',
                padding: '0 16px',
                color: '#1f2937',
            }}
        >
            <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ margin: '0 0 16px', color: '#4b5563' }}>
                The prototype hit an error while rendering. Details below.
            </p>
            <pre
                style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    margin: '0 0 8px',
                }}
            >
                {`${err.name}: ${err.message}`}
            </pre>
            {err.stack && (
                <details style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
                    <summary style={{ cursor: 'pointer' }}>Stack trace</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{err.stack}</pre>
                </details>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => window.location.reload()} style={buttonStyle}>
                    Reload
                </button>
                <button type="button" onClick={resetLocalData} style={buttonStyle}>
                    Clear local data and restart
                </button>
            </div>
        </div>
    );
}

const buttonStyle: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    background: '#ffffff',
    cursor: 'pointer',
    fontSize: 14,
};

export default function AppErrorBoundary({ children }: { children: React.ReactNode }) {
    return (
        <ErrorBoundary
            FallbackComponent={AppErrorFallback}
            onError={(error, info) => console.error('[AppErrorBoundary]', error, info.componentStack)}
        >
            {children}
        </ErrorBoundary>
    );
}
