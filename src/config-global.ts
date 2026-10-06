import { paths } from './routes/paths';

// ROOT PATH AFTER LOGIN SUCCESSFUL
export const PATH_AFTER_LOGIN = paths.dashboard.home;

export const SERVER_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1`;
export const LEAN_APP_TOKEN = `${import.meta.env.VITE_LEAN_APP_TOKEN}`;
export const PAYMENT_FAiLURE_URL = `${import.meta.env.VITE_PAYMENT_FAILURE_URL}`;
export const PAYMENT_SUCCESS_URL = `${import.meta.env.VITE_PAYMENT_SUCCESS_URL}`;
export const ENV = `${import.meta.env.VITE_ENV}`;
export const VITE_PUSHER_APPKEY = `${import.meta.env.VITE_PUSHER_APPKEY}`;
// PROTOTYPE-SETUP: the template literal above turns a missing key into the string "undefined", so test
// the raw env value. Hooks skip creating a Pusher instance when this is false (e.g. on Vercel).
export const HAS_PUSHER_KEY = Boolean(import.meta.env.VITE_PUSHER_APPKEY);
export const PLURAL_GATEWAY_VISIBLE = `${import.meta.env.VITE_PLURAL_GATEWAY_VISIBLE}`;
export const PAYTM_MID = `${import.meta.env.VITE_PAYTM_MID}`;
export const PAYTM_JS_Checkout_URL = `${import.meta.env.VITE_PAYTM_JS_Checkout_URL}`;
export const FRONTEND_BASE_URL = `${import.meta.env.VITE_FRONTEND_BASE_URL}`;
export const USD_TO_INR = `${import.meta.env.VITE_USD_TO_INR}`;
export const PARTNER_ID = import.meta.env.VITE_PARTNER_ID;
export const CALENDLY_URL = `${import.meta.env.VITE_CALENDLY_URL}`;
// PROTOTYPE-SETUP: MOENGAGE_APPID / MOENGAGE_DC / MOENGAGE_DEBUGLOGs removed with the MoEngage SDK.
export const PEKO_COMMERCE_STORE_DOMAIN =
    import.meta.env.VITE_PEKO_COMMERCE_STORE_DOMAIN || 'pekocommerce.com';

export const PARTNER_REDIRECT_URL = import.meta.env.VITE_PARTNER_REDIRECT_URL || '';
export const PARTNER_EXIT_LABEL = import.meta.env.VITE_PARTNER_EXIT_LABEL || 'Return to partner';
export const SSO_LOGIN_ENABLED = import.meta.env.VITE_SSO_LOGIN_ENABLED === 'true';
