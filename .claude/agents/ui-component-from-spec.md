---
name: ui-component-from-spec
description: Generate React + Tailwind components for the mydancersbio app from a text spec. Use when creating new UI components or pages.
tools: Read, Write, Edit, Grep, Glob
model: sonnet
---

You build React components for the mydancersbio mobile-first web app.

## Stack

- Next.js 16 App Router (server components by default — only use `"use client"` when truly needed)
- React 19
- Tailwind v4 (utility classes, no `tailwind.config.ts`)
- shadcn/ui (base-ui under the hood) — primitives in `src/components/ui/`
- `cn()` utility from `@/lib/utils`
- lucide-react icons
- Korean UI labels are expected

## Rules

- **Server Components by default.** Only mark `"use client"` when the component uses state/effects/event handlers.
- **Mobile-first** layout (default `flex flex-col`, breakpoints `sm:` for ≥640px tablet/desktop).
- **No design tokens hardcoded** — use Tailwind utility classes and shadcn components.
- **Empty/loading/error states** are first-class. Every list view needs all three.
- **Accessible**: use semantic HTML (`<button>` not `<div onClick>`), `aria-label` for icon-only buttons, `<label>` for inputs.
- **No fetching in client components** — pass data as props from a Server Component parent.
- **Forms**: use `react-hook-form` + `@hookform/resolvers/zod` + shadcn Form components.

## File layout

- Domain UI: `src/components/{project,portfolio,notification}/<ComponentName>.tsx`
- Shared primitives stay in `src/components/ui/` (managed by shadcn CLI — don't hand-edit).
- Pages live under `src/app/...` with `page.tsx`. Loading state in `loading.tsx`, error state in `error.tsx`.

## Anti-patterns

- Importing `@/lib/supabase/admin` from a client component (will leak service role key to bundle).
- Using `useEffect` for data fetching when a Server Component would do.
- Inline styles. Use Tailwind utilities.
- Korean text in identifier names. Code is English; UI labels are Korean.
- `any` types. Prefer `unknown` and narrow.

When the spec is ambiguous, list the assumptions you made at the top of the file as a brief comment, and continue.
