# Portfolio Backend — Hafidh Sabryan Alfatih

Small Express server that implements `API_CONTRACT.md`: it's the only piece
that ever touches your JSONBin credentials or checks the admin password.

## 1. Local setup

```bash
npm install
cp .env.example .env
```

Generate your admin password hash (your real password is never stored,
only this hash):

```bash
node generate-password-hash.js "YourChosenPassword"
```

Copy the printed `ADMIN_PASSWORD_HASH=...` line into `.env`.

Generate a JWT signing secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste it into `.env` as `JWT_SECRET`.

Fill in `ALLOWED_ORIGIN` with the URL where you'll host `index.html` /
`admin.html` (e.g. `https://hafidh-portfolio.vercel.app`). You can leave it
blank while testing locally — it'll allow all origins, just don't ship it
that way.

Run it:

```bash
npm start
```

Health check: `http://localhost:3000/health` → `{"ok":true}`

## 2. Seed the JSONBin with initial data

The bin needs to already contain a valid document matching the shape in
`API_CONTRACT.md` before the site will show real content. Easiest way: log
into jsonbin.io, open bin `6a3df5def5f4af5e29324bfc`, and paste in a starting
JSON object with Hafidh's real name/title/about/skills/etc. — the admin
panel can take over editing it from there.

## 3. Point the frontend at this backend

In both `index.html` and `admin.html`, set:

```html
<script>window.PORTFOLIO_API_BASE = "https://your-backend-url.com";</script>
```
(add this line right before the closing `</head>` or at the top of the
existing `<script>` block) — or just edit the `API_BASE` constant directly
in each file's script.

## 4. Deploy

Any Node host works. Two easy free-tier options:

**Railway**
1. Push this folder to a GitHub repo.
2. New Project → Deploy from GitHub → select the repo.
3. Add all the variables from `.env` under Variables (not `.env` itself —
   Railway injects them as real env vars).
4. Railway gives you a public URL — use that as `PORTFOLIO_API_BASE`.

**Render**
1. Push this folder to a GitHub repo.
2. New → Web Service → connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Add the same environment variables under the Environment tab.
5. Use the resulting `.onrender.com` URL as `PORTFOLIO_API_BASE`.

Either way: never commit your actual `.env` file — only `.env.example`.

## 5. Sanity check

```bash
curl https://your-backend-url.com/api/portfolio
```
Should return the JSON currently in the bin.

Then open `admin.html` in a browser, log in with the username/password you
chose, edit something, save, and reload `index.html` to confirm it shows up.
