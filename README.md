# 3D Assembly Dashboard (Vue)

Vue 3 + Vite port of `../3d-assembly-dashboard` (Next.js + React + R3F).

## Stack

- Vue 3 + Vite + TypeScript
- Plain Three.js (`three`, `OrbitControls`, `OBJLoader`) — replaces `@react-three/fiber` / `@react-three/drei`
- The renderer/scene/camera/light rig is the **core viewer ported from `../client/libs/3d/viewer.js`**
  (Nuxt app): singleton `viewer`, `initRenderer()`, `initDefaultScene()`, orbit controls, grid,
  4× point lights + key/spot rig, `0xFAFAFA` background. Snap/raycast/synode extras were dropped.
- Tailwind CSS v4 (`@tailwindcss/vite`)
- `axios`, `npyjs`

## Structure (mirrors `../client`)

```
src/
  App.vue                        # layout shell only (panes, mobile tabs)
  libs/3d/viewer.ts              # ← ported from client/libs/3d/viewer.js
  lib/                           # pure helpers/types (animation.ts, types.ts, api.ts)
  composables/useAssemblyJob.ts  # upload → job → poll → artifacts business logic
  components/
    panel/                       # Upload, JobConfig, JobInspector, LogConsole, cards
    viewer/AssemblyViewer.vue    # 3D pane: OBJ loading + sequential playback on top of `viewer`
```

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
| `app/page.tsx`                 | `src/App.vue` + `src/composables/useAssemblyJob.ts` + `src/components/panel/*` |
| `components/ThreeScreen.tsx`   | `src/components/viewer/AssemblyViewer.vue` + `src/libs/3d/viewer.ts` |
| `lib/animation.ts`             | `src/lib/animation.ts`                  |
| `lib/animation.test.ts`        | `src/lib/animation.test.ts`             |
| `app/layout.tsx` + `globals.css` | `index.html` + `src/main.ts` + `src/style.css` |
| `next.config.ts` rewrites      | `vite.config.ts` proxy                  |
| `../client/libs/3d/viewer.js`  | `src/libs/3d/viewer.ts` (core port)     |

Business logic (upload → joint-plan/multi-plan → poll → validate → load artifacts
JSON + `.npy` fallback → sequential animation playback) is preserved 1:1.
