/* eslint-disable import/order */
import React, { Suspense, useState, useEffect } from 'react';

import { Skeleton } from 'antd';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { PersistGate } from 'redux-persist/integration/react';

import { persistor, store } from '@store/store';

import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import './index.css';
import { handleLogout } from './services/handleLogout';
import IncomingCallListener from './domains/dashboard/pekoConnect/components/IncomingCallListener';
import { useAppSelector } from './hooks/store';
// PROTOTYPE-SETUP: MoEngage loader (./moengage-init) removed — analytics SDK that needs Peko's env/infra.

window.addEventListener('vite:preloadError', (event: any) => {
    console.error('Vite preload error:', event);
    if (
        event.payload &&
        event.payload.message.includes('Failed to fetch dynamically imported module')
    ) {
        handleLogout();
    }
    // window.location.reload(); // Refresh the page in case of preload error
});

const Main = () => {
    const [userId, setUserId] = useState('');
    const { user } = useAppSelector(state => state.reducer.user);
    // PROTOTYPE-SETUP: IncomingCallListener subscribes to Peko's production Firestore for the user id; the
    // mock session (no token) gets permission-denied, so leave userId empty and the listener stays idle.
    const { token } = useAppSelector(state => state.reducer.auth);

    useEffect(() => {
        if (user && token) {
            setUserId(user.username || '');
        }
    }, [user, token]);

    return (
        <BrowserRouter>
            <Suspense fallback={<Skeleton />}>
                <IncomingCallListener userId={userId}>
                    <App />
                </IncomingCallListener>
            </Suspense>
        </BrowserRouter>
    );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    // PROTOTYPE-SETUP: outermost boundary — covers store, router, layout, header and pages.
    <AppErrorBoundary>
        <Provider store={store}>
            <PersistGate loading={null} persistor={persistor}>
                <Main />
            </PersistGate>
        </Provider>
    </AppErrorBoundary>
);
