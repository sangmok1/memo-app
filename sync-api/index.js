const crypto = require('crypto');
const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const BUCKET = process.env.GCS_BUCKET || 'memos-sync-api-creator-461905';
const MAX_BYTES = 8 * 1024 * 1024;

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
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

function objectPath(key) {
  return `sync/${key}/bundle.json`;
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

functions.http('syncApi', async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  try {
    const bucket = storage.bucket(BUCKET);

    if (req.method === 'GET') {
      const key = String(req.query.key || '').trim();
      if (!isValidKey(key)) {
        return res.status(400).json({ error: 'invalid_key' });
      }
      const file = bucket.file(objectPath(key));
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

      await bucket.file(objectPath(key)).save(payload, {
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
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  }
});
