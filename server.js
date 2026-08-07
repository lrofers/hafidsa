/**
 * Portfolio backend — Hafidh Sabryan Alfatih
 *
 * Implements:
 *   POST /api/login
 *   GET  /api/portfolio   (public)
 *   PUT  /api/portfolio   (auth required)
 *
 * Photos are uploaded directly from admin.html to Cloudinary (unsigned
 * upload) — this server only ever stores the resulting URLs inside the
 * JSONBin document, which keeps the document comfortably under
 * JSONBin's free-tier 100KB size cap.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const {
  JSONBIN_API_KEY,
  JSONBIN_BIN_ID,
  ADMIN_USERNAME,
  ADMIN_PASSWORD_HASH,
  JWT_SECRET,
  ALLOWED_ORIGIN, // comma-separated list of allowed frontend origins
  PORT = 3000,
} = process.env;

const required = { JSONBIN_API_KEY, JSONBIN_BIN_ID, ADMIN_USERNAME, ADMIN_PASSWORD_HASH, JWT_SECRET };
for (const [key, val] of Object.entries(required)) {
  if (!val) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.use(express.json({ limit: '300kb' })); // plenty once photos are just URLs

const allowedOrigins = (ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  methods: ['GET', 'PUT', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const jbRes = await fetch(`${JSONBIN_URL}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_API_KEY },
    });
    if (!jbRes.ok) throw new Error(`JSONBin responded ${jbRes.status}`);
    const data = await jbRes.json();
    res.set('Cache-Control', 'no-store');
    res.json(data.record);
  } catch (err) {
    console.error('GET /api/portfolio failed:', err);
    res.status(502).json({ error: 'Could not load portfolio data' });
  }
});

function validatePortfolioPayload(body) {
  if (typeof body !== 'object' || body === null) return 'Invalid payload';
  if (body.name && String(body.name).length > 200) return 'Name too long';
  if (body.title && String(body.title).length > 200) return 'Title too long';
  if (body.about && String(body.about).length > 5000) return 'About text too long';
  if (body.skills && !Array.isArray(body.skills)) return 'Skills must be an array';
  if (body.education && !Array.isArray(body.education)) return 'Education must be an array';
  if (body.experience && !Array.isArray(body.experience)) return 'Experience must be an array';
  if (body.projects && !Array.isArray(body.projects)) return 'Projects must be an array';
  return null;
}

app.put('/api/portfolio', requireAuth, async (req, res) => {
  const validationError = validatePortfolioPayload(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const payloadStr = JSON.stringify(req.body);
  console.log(`PUT /api/portfolio payload size: ${payloadStr.length} bytes (${(payloadStr.length / 1024).toFixed(1)} KB)`);

  try {
    const jbRes = await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY,
        'X-Bin-Versioning': 'false', // don't keep version history — avoids piling up storage
      },
      body: payloadStr,
    });
    if (!jbRes.ok) {
      const errBody = await jbRes.text().catch(() => '');
      console.error(`JSONBin PUT responded ${jbRes.status}: ${errBody}`);
      if (jbRes.status === 403 || /100kb|size|limit/i.test(errBody)) {
        return res.status(413).json({
          error: 'Data masih terlalu besar untuk paket gratis JSONBin (maks 100KB). Coba kurangi jumlah foto/teks.',
        });
      }
      throw new Error(`JSONBin responded ${jbRes.status}`);
    }
    const data = await jbRes.json();
    res.json(data.record);
  } catch (err) {
    console.error('PUT /api/portfolio failed:', err);
    res.status(502).json({ error: 'Could not save portfolio data. Cek Railway Logs untuk detail.' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Portfolio backend listening on port ${PORT}`);
});
