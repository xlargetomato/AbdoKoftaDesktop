# Architecture

## Layers

| Layer | Location | Purpose |
|-------|----------|---------|
| Domain types | `shared/types` | Firestore document shapes |
| Domain logic | `shared/services` | Stock calculation, order math (RN-ready) |
| Schema | `shared/schema` | Collection contracts + index hints |
| Infrastructure | `src/renderer/src/lib/firebase` | Firebase SDK, persistence |
| Application services | `src/renderer/src/features/*/ *-service.ts` | Firestore CRUD per feature |
| UI | `src/renderer/src/features`, `components` | React screens |
| Desktop shell | `src/main`, `src/preload` | Printing, window |

## Module map

1. **auth** — Firebase Auth + `users` profile, role gates
2. **sync** — Network + `onSnapshotsInSync` status
3. **inventory** — Ingredients + transaction ledger only
4. **menu** — Categories, items, recipes
5. **orders** — POS cart, completion, auto stock deduction
6. **receipt** — HTML receipt + Electron print IPC
7. **reports** — Aggregated sales from orders
8. **manager / pos** — Route-level pages

## Future React Native

Import from `shared/`:

- `COLLECTIONS`, all types, `inventory-ledger`, `order-calculator`
- Reimplement `*-service.ts` with the same Firestore calls or extract to `shared/api/` later

## Firestore collections

See `shared/constants/collections.ts` and `shared/schema/firestore-schema.ts`.
