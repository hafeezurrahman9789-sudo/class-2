# The Register — Classroom Portal

A real, self-hosted classroom web app: student/staff/admin logins, a proper
SQLite database, PDF/Excel file storage on disk, and JWT-based session
authentication. No third-party accounts or paid services required to run it.

## What's real here (vs. the earlier browser-only prototype)

| | Prototype | This version |
|---|---|---|
| Database | browser key-value store | SQLite (file-based, real SQL, relational tables) |
| Files | base64 text blobs | actual PDF files on disk, streamed by the server |
| Auth | client-side only, static DOB | server-verified sessions (JWT in an httpOnly cookie), rate limiting, admin lockout |
| Installability | browser tab only | installable PWA — real icon, its own window, on desktop/Android/iOS |
| Multi-user | one browser only | any number of real users over the network |
| Organization | flat lists | Notes & Assignments grouped by subject; independent Practicals sections; weekly Quizzes with a leaderboard |

## 1. Install

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd classroom-portal
npm install
cp .env.example .env
```

Open `.env` and set a real `JWT_SECRET` (a random 40+ character string) and,
if you like, your own admin name/password. Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 2. Run it

```bash
npm start
```

Visit **http://localhost:4000** — that's the whole app, frontend and API,
served from one process.

For development with auto-restart on file changes:
```bash
npm run dev
```

## 3. How logins work

- **Students/Staff**: enter register number + full name. The first time a
  register number is used, it's saved automatically as a new account. Every
  login after that just checks the name against what's on file — simple and
  fast, no email or codes involved.
- **Admin**: click the small "Admin" link in the top-right corner of the
  login screen. Default credentials are in `.env` (`ADMIN_NAME` /
  `ADMIN_PASSWORD`) — change them before putting this anywhere public.
  Forgot them? See "Admin recovery" below.

An admin can also pre-register a student or staff account from the admin
panel (register number + name) so that person doesn't have to register
themselves at all — their first login just works.

### Rate limiting & lockouts

- Sign-in attempts are capped at 20 per 10 minutes per device.
- Admin login is capped at 8 attempts per 15 minutes per device, *and* the
  admin account itself locks for 15 minutes after 5 wrong passwords in a
  row, regardless of which device they came from.

### Admin recovery

There's exactly one admin account, configured on the server rather than
self-service. If the password is lost, whoever has terminal access to the
server runs:
```bash
npm run admin:reset
```
This prompts for a new admin name and password and updates `.env` directly.
Restart the server afterwards for the change to take effect.

## 4. Notes & Assignments — organized by subject

Staff add subjects on the fly (an "+ Add subject" box sits above the subject
list in either the Notes or Assignments tab — they share the same subject
list, since a subject like "Thermodynamics" means the same thing in both
places). Click a subject to go inside it:

- **Notes**: staff upload PDFs into the subject; students open or download them.
- **Assignments**: staff post tasks into the subject; students submit a PDF,
  staff review with feedback + marks, same as before — just grouped by subject now.

Staff can rename or delete a subject at any time from the subject list.
**Deleting a subject deletes everything inside it** (its notes, its
assignments, and any student submissions to those assignments) — there's a
confirmation prompt before this happens, but there's no undo, so use it
deliberately.

## 5. Practicals

A separate top-level section with its own independent list of sections
(e.g. "Physics Lab", "Chemistry Lab") — deliberately kept apart from the
Notes/Assignments subject list, since practicals are usually organized
differently than lecture subjects. Staff add as many sections as needed,
upload a PDF per section, and can rename, replace, or delete both the
section and the files inside it. Students browse sections and
download/view the files.

## 6. Weekly Quizzes

Built around external quiz forms (Google Forms or similar) rather than a
built-in quiz builder:

1. Staff posts a quiz with a title, date, and a link to the form.
2. Students open the form from the quiz card and take it externally as usual.
3. After grading, staff enters each student's score into an editable score
   sheet (same spreadsheet-style table as attendance — type directly into
   the cells, then Save).
4. Everyone — staff and students — sees a live leaderboard for that quiz,
   ranked highest score first. Students see their own row highlighted.

## 7. Where things live

```
server/         Express API, SQLite schema, auth, file handling
  db.js         Table definitions (students, staff, subjects, notes, quizzes, etc.)
  routes/       One file per resource (notes, subjects, practicals, quizzes, ...)
  uploadUtil.js Disk storage config for uploaded PDFs
client/         Plain HTML/CSS/JS frontend (no build step)
  assets/       Custom SVG illustrations (hero image, favicon, background)
uploads/        Uploaded PDF files land here at runtime
data/           The SQLite database file lives here at runtime
```

Excel/CSV files for attendance and semester results are parsed on upload and
stored as rows in the database — the spreadsheet itself isn't kept, only its
data, which staff can then edit directly in the browser.

## 8. Deploying it for real

This runs as a normal Node.js web server, so any of these work:

**Render / Railway / Fly.io** — connect your GitHub repo, set the environment
variables from `.env.example` in their dashboard, and add a persistent disk
mounted at `/uploads` and `/data` (both platforms support this) so files and
the database survive restarts and deploys.

**A VPS (e.g. DigitalOcean, Hetzner)** — `git clone`, `npm install --production`,
set up `.env`, then run it behind a process manager:
```bash
npm install -g pm2
pm2 start server/index.js --name the-register
pm2 save
```
Put Nginx or Caddy in front for HTTPS.

**Docker** — a minimal Dockerfile:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 4000
CMD ["node", "server/index.js"]
```
Mount volumes for `/app/uploads` and `/app/data` so data persists.

## 9. Growing beyond SQLite / local disk

SQLite comfortably handles a single class or a whole small institution. If
you outgrow it:

- **Database**: swap `server/db.js` for a Postgres client (e.g. `pg`) — the
  rest of the app talks to `db.prepare(...).run/get/all(...)`, so only that
  one file needs rewriting to a Postgres-flavored equivalent (or use an ORM
  like Prisma/Drizzle and adjust the route files' queries).
- **File storage**: swap `server/uploadUtil.js` to stream into an S3-compatible
  bucket (AWS S3, Cloudflare R2, Backblaze B2) instead of local disk — the
  route files only call `uploadPdf.single('file')` and read `req.file`, so
  the multer storage engine is the only thing that needs to change.

## 10. Installing it as an app (PWA)

The app is a Progressive Web App: once it's reachable over HTTPS (or on
`localhost` for testing), visitors can install it with a real icon that opens
in its own window, no browser bar. This is on top of the website — you still
need to run the server somewhere (see section 8); installing just changes how
people *open* it afterwards.

- **Desktop Chrome/Edge**: an install icon appears in the address bar, or use
  the in-app "⇩ Install app" button on the login screen / sidebar.
- **Android (Chrome)**: same in-app "Install app" button, or the browser's
  "Add to Home screen" menu option.
- **iOS/iPadOS (Safari)**: Apple doesn't support the automatic install prompt,
  so it's manual: open the site in Safari → Share button → **Add to Home
  Screen**. It'll still get its own icon and open full-screen like a native app.

Notes:
- The install button only appears in browsers that support it (Chromium-based).
  It simply won't render elsewhere — nothing to configure.
- `client/sw.js` is the service worker; it caches the app shell (HTML/CSS/JS/
  icons) for fast, installable loading, but deliberately never caches `/api/*`
  requests, so data is always live.
- App icons are generated from `client/assets/icon-source.svg` and
  `icon-maskable-source.svg`. Edit those and re-render with any SVG-to-PNG
  tool (e.g. `npx sharp-cli`) at 192px and 512px if you want to rebrand it.

## 11. Security notes before going live

- Change `ADMIN_PASSWORD` and `JWT_SECRET` — the defaults are for local
  testing only.
- Run behind HTTPS in production (the session cookie is marked `secure` when
  `NODE_ENV=production`, which requires HTTPS to work at all).
- Back up the `data/` and `uploads/` folders regularly — they're the entire
  database and file store.
- Since login no longer requires anything secret (just a name), anyone who
  knows or guesses a register number and the matching name can sign in as
  that person. That's a deliberate simplicity trade-off — reasonable for a
  low-stakes classroom tool, worth reconsidering if this ever needs to guard
  something sensitive.
