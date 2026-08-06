# API Contract — Hafidh Sabryan Alfatih Portfolio

This describes what your backend needs to implement so `index.html` (public site)
and `admin.html` (admin panel) work. Your backend is the **only** thing that
should ever hold the JSONBin credentials:

```
JSONBIN_API_KEY = "$2a$10$XOgrR0xaMJfQ2yt8OLhgTuqAWVzfzxn6V.NYNvp.X9yD9YoG7Yr5O"
JSONBIN_BIN_ID  = "6a3df5def5f4af5e29324bfc"
```

Keep both as server-side environment variables. Never send them to the
browser in any response, script, or HTML comment.

Set `window.PORTFOLIO_API_BASE = "https://your-backend.example.com"` (e.g. in
a small `<script>` tag before the main script in `index.html`/`admin.html`,
or edit the `API_BASE` constant directly) once you know your backend's URL.

---

## 1. Data model

This is the JSON object stored in the JSONBin bin, and the shape every
endpoint below sends/receives:

```jsonc
{
  "name": "Hafidh Sabryan Alfatih",
  "title": "Content Creator",
  "photoUrl": "https://.../photo.jpg",
  "about": "Bio text...",
  "skills": [
    { "label": "Ps", "name": "Photoshop", "color": "#001e36" }
  ],
  "education": [
    { "period": "2019 - 2022", "title": "School name", "sub": "Major / note" }
  ],
  "experience": [
    { "period": "2024 - Present", "title": "Role", "sub": "Short description" }
  ],
  "languages": [
    { "name": "Indonesia", "level": 95 }
  ],
  "contact": {
    "instagram": "yourhandle",
    "tiktok": "yourhandle",
    "youtube": "yourhandle",
    "pinterest": "yourhandle"
  },
  "projects": [
    { "title": "Project Name", "imageUrl": "https://...", "big": true }
  ]
}
```

## 2. Auth

Store an admin username + a **bcrypt-hashed** password as environment
variables on your server (e.g. `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`).
Never store or compare a plaintext password, and never do the password
check in client-side JS — `admin.html` only ever sends the typed password
over HTTPS to your backend, once, at login.

### `POST /api/login`
**Request**
```json
{ "username": "string", "password": "string" }
```
**Response `200`**
```json
{ "token": "signed-jwt-or-opaque-session-token" }
```
**Response `401`**
```json
{ "error": "Invalid username or password" }
```

Implementation notes:
- Compare the submitted password against the bcrypt hash with a bcrypt
  library (`bcrypt.compare`), never `===`.
- Issue a short-lived signed token (JWT with a server-side secret, or an
  opaque token stored in a server-side session store). 12–24 hour expiry
  is reasonable for an admin panel like this.
- Rate-limit this endpoint (e.g. 5 attempts / 15 min / IP) to blunt
  brute-forcing.

### Authenticated requests
Every endpoint below except `GET /api/portfolio` (public read) requires:
```
Authorization: Bearer <token>
```
Return `401 { "error": "..." }` for a missing/invalid/expired token.

---

## 3. Endpoints

### `GET /api/portfolio` — public, no auth
Returns the current data model (used by `index.html` and to prefill
`admin.html`). Your server fetches this from JSONBin server-side and
relays it:

```
GET https://api.jsonbin.io/v3/b/{JSONBIN_BIN_ID}/latest
Headers: X-Master-Key: {JSONBIN_API_KEY}
```
Return JSONBin's `record` field as the response body (the data model
above). Add `Cache-Control: no-store` or a short max-age so edits show
up quickly.

### `PUT /api/portfolio` — requires auth
**Request body**: the full data model (as edited in `admin.html`).
Your server should:
1. Validate the auth token.
2. Validate/sanitize the payload (reasonable length limits on text
   fields, valid URLs for `photoUrl`/`imageUrl`, etc.).
3. Write it to JSONBin:
```
PUT https://api.jsonbin.io/v3/b/{JSONBIN_BIN_ID}
Headers:
  Content-Type: application/json
  X-Master-Key: {JSONBIN_API_KEY}
Body: <the data model JSON>
```
4. Return the saved object with `200`.

### `POST /api/upload-photo` — requires auth
**Request**: `multipart/form-data` with a `photo` file field.
Your server should:
1. Validate the auth token.
2. Validate the file (image mime type, reasonable size limit e.g. 5MB).
3. Store the image somewhere durable and get a public URL — e.g. upload
   it to Cloudinary, S3/R2, or similar. (JSONBin itself only stores JSON,
   not binary files, so the photo needs separate file storage; the bin
   just stores the resulting URL string.)
4. Return:
```json
{ "photoUrl": "https://your-storage.example.com/hafidh-photo.jpg" }
```
The admin panel then includes this URL in its next `PUT /api/portfolio`.

---

## 4. CORS

If the frontend and backend are on different origins, your backend needs:
```
Access-Control-Allow-Origin: https://your-portfolio-domain.com
Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```
Handle `OPTIONS` preflight requests for `PUT`/`POST`/`Authorization`.

## 5. Summary of what stays where

| Secret / logic                  | Lives in                     |
|----------------------------------|-------------------------------|
| `JSONBIN_API_KEY`, `JSONBIN_BIN_ID` | Backend env vars only |
| Admin password (hashed)          | Backend env vars only |
| Session/JWT signing secret       | Backend env vars only |
| Password comparison logic        | Backend only |
| `index.html`, `admin.html`       | Only ever hold your backend's public URL |
