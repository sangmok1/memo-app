const crypto = require('crypto');
const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { OAuth2Client } = require('google-auth-library');
const { mergeAppStates, mergeArchiveTrees } = require('./sync-merge');

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'memos-sync-api-creator-461905';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const MAX_BYTES = 8 * 1024 * 1024;
const oauthClient = new OAuth2Client();

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isValidKey(key) {
  return typeof key === 'string' && /^[\w-]{12,64}$/.test(key);
}

function generateSyncKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  const rand = crypto.randomBytes(6).toString('base64url').replace(/[_-]/g, 'x').slice(0, 10);
  return `${datePart}-${rand}`;
}

function legacyObjectPath(key) {
  return `sync/${key}/bundle.json`;
}

function userObjectPath(sub) {
  const safe = String(sub || '').replace(/[^\w.-]/g, '_');
  return `users/${safe}/bundle.json`;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.rawBody === 'string' && req.rawBody) {
    return JSON.parse(req.rawBody);
  }
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8'));
  }
  return {};
}

async function verifyGoogleAuth(req) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  if (!GOOGLE_CLIENT_ID) {
    const err = new Error('google_client_not_configured');
    err.status = 500;
    throw err;
  }

  const ticket = await oauthClient.verifyIdToken({
    idToken: token,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  return payload;
}

async function readUserBundle(bucket, sub) {
  const file = bucket.file(userObjectPath(sub));
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return JSON.parse(buf.toString('utf8'));
}

async function saveUserBundle(bucket, sub, bundle) {
  const payload = JSON.stringify(bundle);
  if (Buffer.byteLength(payload, 'utf8') > MAX_BYTES) {
    const err = new Error('too_large');
    err.status = 413;
    throw err;
  }
  await bucket.file(userObjectPath(sub)).save(payload, {
    contentType: 'application/json; charset=utf-8',
    metadata: { cacheControl: 'no-store' },
  });
  return payload.length;
}

functions.http('syncApi', async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  try {
    const bucket = storage.bucket(BUCKET);
    const authHeader = String(req.headers.authorization || '');

    if (authHeader.startsWith('Bearer ')) {
      const payload = await verifyGoogleAuth(req);

      if (req.method === 'GET') {
        const bundle = await readUserBundle(bucket, payload.sub);
        if (!bundle) {
          return res.status(404).json({ error: 'not_found' });
        }
        return res.json({
          userId: payload.sub,
          email: payload.email || '',
          bundle,
        });
      }

      if (req.method === 'POST') {
        const body = await readBody(req);
        const incoming = body.bundle;
        if (!incoming || typeof incoming !== 'object') {
          return res.status(400).json({ error: 'missing_bundle' });
        }

        const mode = body.mode === 'merge' ? 'merge' : 'replace';
        let bundle = incoming;

        if (mode === 'merge') {
          const existing = await readUserBundle(bucket, payload.sub);
          if (existing) {
            bundle = {
              version: 2,
              exportedAt: new Date().toISOString(),
              appState: mergeAppStates(existing.appState, incoming.appState),
              archives: mergeArchiveTrees(existing.archives, incoming.archives),
            };
          }
        }

        const size = await saveUserBundle(bucket, payload.sub, bundle);
        return res.json({
          userId: payload.sub,
          email: payload.email || '',
          exportedAt: bundle.exportedAt || new Date().toISOString(),
          size,
        });
      }

      return res.status(405).json({ error: 'method_not_allowed' });
    }

    if (req.method === 'GET') {
      const key = String(req.query.key || '').trim();
      if (!isValidKey(key)) {
        return res.status(400).json({ error: 'invalid_key' });
      }
      const file = bucket.file(legacyObjectPath(key));
      const [exists] = await file.exists();
      if (!exists) {
        return res.status(404).json({ error: 'not_found' });
      }
      const [buf] = await file.download();
      const bundle = JSON.parse(buf.toString('utf8'));
      return res.json({ key, bundle });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const bundle = body.bundle;
      if (!bundle || typeof bundle !== 'object') {
        return res.status(400).json({ error: 'missing_bundle' });
      }
      const payload = JSON.stringify(bundle);
      if (Buffer.byteLength(payload, 'utf8') > MAX_BYTES) {
        return res.status(413).json({ error: 'too_large' });
      }

      let key = body.key ? String(body.key).trim() : '';
      if (key && !isValidKey(key)) {
        return res.status(400).json({ error: 'invalid_key' });
      }
      if (!key) key = generateSyncKey();

      await bucket.file(legacyObjectPath(key)).save(payload, {
        contentType: 'application/json; charset=utf-8',
        metadata: { cacheControl: 'no-store' },
      });

      return res.json({
        key,
        exportedAt: bundle.exportedAt || new Date().toISOString(),
        size: payload.length,
      });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message || 'request_failed' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
