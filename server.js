/**
 * Portfolio backend — Hafidh Sabryan Alfatih
 *
 * Implements the endpoints described in API_CONTRACT.md:
 *   POST /api/login
 *   GET  /api/portfolio        (public)
 *   PUT  /api/portfolio        (auth required)
 *   POST /api/upload-photo     (auth required)
 *
 * All JSONBin credentials and the admin password hash live ONLY
 * in environment variables on this server — never in the frontend.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');

const {
  JSONBIN_API_KEY,
  JSONBIN_BIN_ID,
  ADMIN_USERNAME,
  ADMIN_PASSWORD_HASH,
  JWT_SECRET,
  ALLOWED_ORIGIN, // e.g. https://your-portfolio-domain.com (comma-separated for multiple)
  PORT = 3000,
} = process.env;

// Fail fast if required config is missing.
const required = { JSONBIN_API_KEY, JSONBIN_BIN_ID, ADMIN_USERNAME, ADMIN_PASSWORD_HASH, JWT_SECRET };
for (const [key, val] of Object.entries(required)) {
  if (!val) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

const allowedOrigins = (ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  methods: ['GET', 'PUT', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;

// ---------- Auth helpers ----------

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

// ---------- Rate limiting on login ----------

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

// ---------- POST /api/login ----------

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

// ---------- GET /api/portfolio (public) ----------

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

// ---------- PUT /api/portfolio (auth required) ----------

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

  try {
    const jbRes = await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_API_KEY,
      },
      body: JSON.stringify(req.body),
    });
    if (!jbRes.ok) throw new Error(`JSONBin responded ${jbRes.status}`);
    const data = await jbRes.json();
    res.json(data.record);
  } catch (err) {
    console.error('PUT /api/portfolio failed:', err);
    res.status(502).json({ error: 'Could not save portfolio data' });
  }
});

// ---------- POST /api/upload-photo (auth required) ----------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB raw upload cap
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

app.post('/api/upload-photo', requireAuth, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      // Resize + compress so the resulting base64 stays small enough
      // to live comfortably inside the JSONBin document.
      const resized = await sharp(req.file.buffer)
        .resize({ width: 800, height: 1000, fit: 'cover' })
        .jpeg({ quality: 72 })
        .toBuffer();

      if (resized.length > 400 * 1024) {
        return res.status(400).json({ error: 'Image too large after compression — try a smaller photo.' });
      }

      const base64 = resized.toString('base64');
      const photoUrl = `data:image/jpeg;base64,${base64}`;
      res.json({ photoUrl });
    } catch (err) {
      console.error('Photo processing failed:', err);
      res.status(500).json({ error: 'Could not process image' });
    }
  });
});

// ---------- Health check ----------

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Portfolio backend listening on port ${PORT}`);
});
