# عبد الكفتة — Restaurant POS (Electron)

Arabic-first RTL desktop POS and restaurant management system built with **Electron**, **React 19**, **TypeScript**, and **Firebase Firestore**.

## Quick start

1. Create a Firebase project → enable **Email/Password** + **Firestore**.
2. Fill **`.env.local`** with your Firebase web config (`VITE_FIREBASE_*`).
3. Download a **service account JSON** and save as `service-account.json` in the project root.
4. **Create Firestore** (required once per project):

```bash
npm run seed
```

The seed script opens Firebase Console if Firestore is not ready, waits for you to click **Create database**, then seeds automatically.

Or open manually: [Firestore setup](https://console.firebase.google.com/project/abdokofta-d005f/firestore) → Create database → Production mode.

5. Enable **Email/Password** in [Authentication](https://console.firebase.google.com/project/abdokofta-d005f/authentication/providers).

6. Deploy rules (optional, after seed):

```bash
firebase deploy --only firestore
```

8. Run the app:

```bash
npm run dev
```

### Default accounts (after `npm run seed`)

| Role    | Email                      | Password     |
|---------|----------------------------|--------------|
| Manager | manager@abdokofta.local    | Manager123!  |
| Cashier | cashier@abdokofta.local    | Cashier123!  |

Override seed accounts in `.env` or `.env.local`. Seed also creates sample ingredients, opening stock, and a **ساندويتش كفتة** menu item with recipe.

### Environment files

| File         | Committed | Purpose                                      |
|--------------|-----------|----------------------------------------------|
| `.env`       | Yes       | Variable names + non-secret defaults (seed)  |
| `.env.local` | No        | Firebase keys, service account path, overrides |

Vite and `npm run seed` both load `.env` first, then `.env.local` (local wins).

## Commands

| Command           | Description                          |
|-------------------|--------------------------------------|
| `npm run dev`     | Development (Electron + Vite)        |
| `npm run build`   | Production build (`out/`)            |
| `npm run dist:win` | Windows installer (NSIS, see below) |
| `npm run preview:prod` | Test production build locally before packaging |
| `npm run seed`    | Seed Firestore + Auth (admin SDK)   |
| `npm run typecheck` | TypeScript check                   |

## Export for Windows (installer)

1. Put your Firebase web keys in **`.env.local`** (they are **baked in at build time** — rebuild after changing keys).
2. Optional: test the production build before packaging:

```bash
npm run preview:prod
```

3. Build the installer:

```bash
npm install
npm run dist:win
```

4. Output: **`release/Abdo Kofta POS-1.0.0-Setup.exe`** — run it on the POS PC, choose install folder, finish wizard, then launch from Start Menu or desktop shortcut.

**If you see a white screen after install**

- Rebuild with a valid **`.env.local`** (`VITE_FIREBASE_*` filled in).
- The app uses **hash routing** (`#/login`) so it works from the installed `file://` bundle (browser routing breaks in production).

**Smaller size tips**

| Tip | Why |
|-----|-----|
| `dist:win` uses NSIS + x64 only | One architecture, standard installer |
| Keep `.env.local` out of the package | Only Vite embeds `VITE_*` at build time |
| Do not ship `service-account.json` with the installer | Only needed for seed / delete-cashier on a manager PC |
| `electronLanguages: en-US` | Drops unused Electron locale files |

Expect roughly **150–250 MB** installed — most of that is Electron + Chromium.

**Production UI:** packaged builds hide the top menu bar and DevTools. In dev, `npm run dev` still opens DevTools and F12 works.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

```
shared/           # Types + business logic (React Native ready)
scripts/seed.ts   # Firebase Admin seed script
src/renderer/     # React UI (lazy-loaded routes)
```

## Inventory ledger

Stock is **never** updated directly. Every movement is an `inventory_transactions` row:

- **purchase** — شراء مخزون (+)
- **sale** — خصم تلقائي من الطلب (−)
- **waste** — هدر (−)
- **adjustment** — تسوية يدوية (+/−) from Manager → المخزون

## Offline

Firestore IndexedDB persistence. Header badge: متصل / غير متصل / جاري المزامنة / تمت المزامنة.

## Bundle

Production build splits **firebase**, **react-vendor**, and **router** into separate chunks; feature pages load on demand.

## Manual setup (without seed)

If you prefer the console: create Auth users and documents as described in `shared/schema/firestore-schema.ts`, or run `npm run seed` once.
