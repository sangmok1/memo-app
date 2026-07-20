const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const DEFAULT_REDIRECT_PORT = 47829;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const BASE_SCOPES = ['openid', 'email', 'profile'];
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

function getOAuthScopes(options = {}) {
  const scopes = [...BASE_SCOPES];
  if (options.includeCalendar) scopes.push(CALENDAR_SCOPE);
  return scopes;
}

function loadEnvGoogleOAuth(appRoot) {
  const envPath = path.join(appRoot, '.env.google.oauth');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
  } catch {}
}

function loadGoogleOAuthConfig(appRoot) {
  loadEnvGoogleOAuth(appRoot);
  const configPath = path.join(appRoot, 'google-oauth.config.json');
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {}

  const redirectPort = Number(
    cfg.redirectPort
    || process.env.GOOGLE_OAUTH_REDIRECT_PORT
    || DEFAULT_REDIRECT_PORT,
  );

  return {
    ...cfg,
    clientId: String(cfg.clientId || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    clientSecret: String(cfg.clientSecret || process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
    redirectPort: Number.isFinite(redirectPort) ? redirectPort : DEFAULT_REDIRECT_PORT,
  };
}

function getOAuthRedirect(appRoot) {
  const cfg = loadGoogleOAuthConfig(appRoot);
  const port = cfg.redirectPort;
  return {
    port,
    redirectUri: `http://127.0.0.1:${port}/callback`,
  };
}

function getClientId(appRoot) {
  return loadGoogleOAuthConfig(appRoot).clientId;
}

function getClientSecret(appRoot) {
  return loadGoogleOAuthConfig(appRoot).clientSecret;
}

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

let oauthCallbackServer = null;
let oauthCallbackTimer = null;

function closeOAuthCallbackServer() {
  if (oauthCallbackTimer) {
    clearTimeout(oauthCallbackTimer);
    oauthCallbackTimer = null;
  }
  if (!oauthCallbackServer) return Promise.resolve();
  const server = oauthCallbackServer;
  oauthCallbackServer = null;
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

function waitForOAuthCallback(expectedState, port, redirectUri) {
  return new Promise((resolve, reject) => {
    closeOAuthCallbackServer().then(() => {
      const server = http.createServer((req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }

        const url = new URL(req.url, redirectUri);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html lang="ko"><body style="font-family:sans-serif;text-align:center;padding:48px">
        <h2>${error ? '로그인 실패' : '로그인 완료'}</h2>
        <p>Memos로 돌아가 주세요. 이 창은 닫아도 됩니다.</p>
      </body></html>`);

        closeOAuthCallbackServer().finally(() => {
          if (error) {
            reject(new Error(error));
            return;
          }
          if (!code || state !== expectedState) {
            reject(new Error('invalid_oauth_callback'));
            return;
          }
          resolve(code);
        });
      });

      server.on('error', (err) => {
        closeOAuthCallbackServer();
        if (err.code === 'EADDRINUSE') {
          reject(new Error('oauth_port_in_use'));
          return;
        }
        reject(err);
      });

      oauthCallbackServer = server;
      oauthCallbackTimer = setTimeout(() => {
        closeOAuthCallbackServer();
        reject(new Error('oauth_login_timeout'));
      }, 5 * 60 * 1000);

      server.listen(port, '127.0.0.1', () => {});
    }).catch(reject);
  });
}

async function exchangeCodeForTokens(code, verifier, clientId, clientSecret, redirectUri) {
  const params = {
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  };
  if (clientSecret) {
    params.client_secret = clientSecret;
  } else {
    params.code_verifier = verifier;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'token_exchange_failed');
  return data;
}

function decodeJwtPayload(token) {
  const part = String(token || '').split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function buildGoogleAuthRecord(tokens, options = {}) {
  const idPayload = decodeJwtPayload(tokens.id_token) || {};
  return {
    sub: idPayload.sub || '',
    email: idPayload.email || '',
    name: idPayload.name || idPayload.email || '',
    refreshToken: tokens.refresh_token || '',
    idToken: tokens.id_token || '',
    accessToken: tokens.access_token || '',
    expiresAt: tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
      : '',
    calendarScopeGranted: Boolean(options.includeCalendar),
    updatedAt: new Date().toISOString(),
  };
}

async function refreshGoogleTokens(auth, clientId, clientSecret) {
  if (!auth?.refreshToken) throw new Error('google_not_signed_in');

  const params = {
    client_id: clientId,
    refresh_token: auth.refreshToken,
    grant_type: 'refresh_token',
  };
  if (clientSecret) params.client_secret = clientSecret;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'token_refresh_failed');

  const idPayload = decodeJwtPayload(data.id_token) || {};
  return {
    ...auth,
    sub: idPayload.sub || auth.sub,
    email: idPayload.email || auth.email,
    name: idPayload.name || auth.name,
    idToken: data.id_token || auth.idToken,
    accessToken: data.access_token || auth.accessToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
      : auth.expiresAt,
    updatedAt: new Date().toISOString(),
  };
}

async function getValidAccessToken(auth, clientId, clientSecret, saveAuth) {
  if (!auth?.refreshToken && !auth?.accessToken) throw new Error('google_not_signed_in');

  const expiresAt = auth.expiresAt ? new Date(auth.expiresAt).getTime() : 0;
  const needsRefresh = !auth.accessToken || Date.now() > expiresAt - 60 * 1000;

  if (!needsRefresh) return auth.accessToken;

  const next = await refreshGoogleTokens(auth, clientId, clientSecret);
  if (saveAuth) saveAuth(next);
  return next.accessToken;
}

async function getValidIdToken(auth, clientId, clientSecret, saveAuth) {
  if (!auth?.refreshToken && !auth?.idToken) throw new Error('google_not_signed_in');

  const expiresAt = auth.expiresAt ? new Date(auth.expiresAt).getTime() : 0;
  const needsRefresh = !auth.idToken || Date.now() > expiresAt - 60 * 1000;

  if (!needsRefresh) return auth.idToken;

  const next = await refreshGoogleTokens(auth, clientId, clientSecret);
  if (saveAuth) saveAuth(next);
  return next.idToken;
}

async function loginWithGoogle(appRoot, options = {}) {
  const clientId = getClientId(appRoot);
  const clientSecret = getClientSecret(appRoot);
  const { port, redirectUri } = getOAuthRedirect(appRoot);
  if (!clientId) throw new Error('google_oauth_not_configured');

  const { verifier, challenge } = createPkcePair();
  const state = crypto.randomBytes(16).toString('hex');
  const callbackPromise = waitForOAuthCallback(state, port, redirectUri);
  const scopes = getOAuthScopes(options);

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  if (!clientSecret) {
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
  }

  await shell.openExternal(authUrl.toString());
  try {
    const code = await callbackPromise;
    const tokens = await exchangeCodeForTokens(code, verifier, clientId, clientSecret, redirectUri);
    if (!tokens.refresh_token) {
      throw new Error('google_missing_refresh_token');
    }
    return buildGoogleAuthRecord(tokens, options);
  } catch (err) {
    await closeOAuthCallbackServer();
    throw err;
  }
}

function publicGoogleAuth(auth) {
  if (!auth?.sub) return null;
  return {
    sub: auth.sub,
    email: auth.email || '',
    name: auth.name || auth.email || '',
    calendarScopeGranted: Boolean(auth.calendarScopeGranted),
  };
}

module.exports = {
  getClientId,
  getClientSecret,
  getOAuthRedirect,
  loginWithGoogle,
  getValidIdToken,
  getValidAccessToken,
  publicGoogleAuth,
};
