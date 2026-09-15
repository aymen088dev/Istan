# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Main product is **ISTAN CREATOR** — a football/hockey lineup creator web app.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI (`artifacts/lineup-creator`)
- **API framework**: Express 5 (`artifacts/api-server`)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Export**: html2canvas-pro (PNG image download)

## Lineup Creator Features

- Football & Hockey support
- 35+ football formations + 8 hockey formations
- Drag & drop player positioning
- Jersey customizer (8 styles, custom colors, club presets)
- Bench management: add/remove/edit substitutes with nationality flags
- Mobile-first UI: quick controls bar at top, bench panel bottom sheet
- Pitch backgrounds (12 football + 6 hockey) + custom grass color + tint overlay
- Title with custom color picker
- Export to PNG (optimized for large bench counts)
- Composition library (save/load)
- Player library (save favorite players)
- Global Best XI analysis: role, side, rating and goalkeeper fit are optimized together
- Formation analysis for every football/hockey system, with recommended formation and post-by-post warnings
- Separate JSON analysis downloads for football and hockey, generated from the complete formation catalog

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
