# 3D Assembly Dashboard (Vue)

Vue 3 + Vite port of `../3d-assembly-dashboard` (Next.js + React + R3F).

## Stack

- Vue 3 + Vite + TypeScript
- Plain Three.js (`three`, `OrbitControls`, `OBJLoader`) — replaces `@react-three/fiber` / `@react-three/drei`
- Tailwind CSS v4 (`@tailwindcss/vite`)
- `axios`, `npyjs`

## Run dev

```bash
npm install
npm run dev      # http://localhost:3000
```

Requests to `/backend/*` are transparently proxied to the Docker backend at `http://localhost:8000`
(equivalent of `rewrites()` in the Next.js version's `next.config.ts`).

## Build / test

```bash
npm test     # node --test src/lib/*.test.ts
npm run build
npm run preview
```

## Source file mapping

| Next.js (original)              | Vue (this port)                          |
| ------------------------------ | --------------------------------------- |
| `app/page.tsx`                 | `src/App.vue`                           |
| `components/ThreeScreen.tsx`   | `src/components/ThreeScene.vue`         |
| `lib/animation.ts`             | `src/lib/animation.ts`                  |
| `lib/animation.test.ts`        | `src/lib/animation.test.ts`             |
| `app/layout.tsx` + `globals.css` | `index.html` + `src/main.ts` + `src/style.css` |
| `next.config.ts` rewrites      | `vite.config.ts` proxy                  |

Business logic (upload → joint-plan/multi-plan → poll → validate → load artifacts
JSON + `.npy` fallback → sequential animation playback) is preserved 1:1.
