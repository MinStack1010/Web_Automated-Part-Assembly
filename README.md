# 3D Assembly Dashboard (Vue)

Port Vue 3 + Vite của `../3d-assembly-dashboard` (Next.js + React + R3F).

## Stack

- Vue 3 + Vite + TypeScript
- Three.js thuần (`three`, `OrbitControls`, `OBJLoader`) — thay cho `@react-three/fiber` / `@react-three/drei`
- Tailwind CSS v4 (`@tailwindcss/vite`)
- `axios`, `npyjs`

## Chạy dev

```bash
npm install
npm run dev      # http://localhost:3000
```

Request `/backend/*` được proxy ngầm sang backend Docker ở `http://localhost:8000`
(tương đương `rewrites()` trong `next.config.ts` của bản Next.js).

## Build / test

```bash
npm test     # node --test src/lib/*.test.ts
npm run build
npm run preview
```

## Đối chiếu file gốc

| Next.js (bản gốc)              | Vue (bản này)                          |
| ------------------------------ | --------------------------------------- |
| `app/page.tsx`                 | `src/App.vue`                           |
| `components/ThreeScreen.tsx`   | `src/components/ThreeScene.vue`         |
| `lib/animation.ts`             | `src/lib/animation.ts`                  |
| `lib/animation.test.ts`        | `src/lib/animation.test.ts`             |
| `app/layout.tsx` + `globals.css` | `index.html` + `src/main.ts` + `src/style.css` |
| `next.config.ts` rewrites      | `vite.config.ts` proxy                  |

Logic nghiệp vụ (upload → joint-plan/multi-plan → poll → validate → load artifacts
JSON + fallback `.npy` → phát animation tuần tự) được giữ nguyên 1:1.
