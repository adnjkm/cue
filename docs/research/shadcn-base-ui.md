# shadcn/ui with Base UI on Cue's stack

Researched and probed on 2026-10-27. Every command and file below was run or generated in a throwaway Next 16 app, not in this repo. Probe path (session scratch, may be gone later): `/private/tmp/claude-501/.../scratchpad/shadcn-probe`.

What the probe proved:

- `shadcn init -b base` writes a Base UI setup (`style: "base-nova"`) on Next 16.4.3, React 19, Tailwind 4.3.3.
- All 17 requested components installed and render. `tsc` (TypeScript 7.0.2), `eslint` and `next build` pass after the two fixes in "Next 16 and React 19 gotchas".
- Select, Dialog, Tooltip, Sidebar, Popover with Calendar and DropdownMenu worked in a browser on `next dev`, with no console errors.

## Versions

| Package | Version | Note |
| --- | --- | --- |
| shadcn (CLI) | 4.23.0 | `npm view shadcn version` on 2026-10-27. Init writes `"shadcn": "^4.22.1"` into package.json. |
| @base-ui/react | 1.9.0 | Renamed from `@base-ui-components/react`. Never import the old name. |
| next / create-next-app | 16.4.3 | Same as this repo. |
| react / react-dom | 19.3.0 in probe, 19.3.1 in repo | |
| tailwindcss, @tailwindcss/turbopack | 4.3.3 | |
| typescript | 7.0.2 | See the ESLint gotcha. |
| cn | 0.5.0 | shadcn's own replacement for clsx plus tailwind-merge. Repo `shadcn-ui/cn`. |
| class-variance-authority | 0.7.1 | |
| lucide-react | 1.61.0 | Icon library picked by the preset. |
| tw-animate-css | 1.4.0 | |
| react-day-picker, date-fns | 10.0.2, 4.4.0 | Pulled in by `calendar`. |
| pnpm, node | 12.9.1, 26.7.0 | |

## Install steps for this repo

This repo has no Tailwind and no ESLint today. Do the steps in order. Pin the CLI version so reruns match this note.

1. Add Tailwind v4. create-next-app 16.4.3 wires Tailwind through a Turbopack loader, not PostCSS. That is the path the probe verified.

   ```bash
   pnpm add -D tailwindcss@^4.3.3 @tailwindcss/turbopack@^4.3.3
   ```

   ```ts
   // next.config.ts
   import type { NextConfig } from "next";

   const nextConfig: NextConfig = {
     devIndicators: false,
     turbopack: {
       rules: {
         "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
       },
     },
   };

   export default nextConfig;
   ```

   The bundled Next docs (`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`) still describe the PostCSS route: `pnpm add -D tailwindcss @tailwindcss/postcss` plus `postcss.config.mjs`. It also works. Pick one, not both.

2. Clear the token names that collide with Tailwind. Today `app/globals.css` declares `--color-border`, `--radius-sm`, `--text-sm`, `--font-mono` and other names in Tailwind's theme namespaces. `--color-border` would fight shadcn's `--color-border: var(--border)`. Move these values into the shadcn tokens (see "Proposed Cue mapping") and delete the old names. Then put `@import "tailwindcss";` on the first line.

3. Run init with the Base UI flavour.

   ```bash
   pnpm dlx shadcn@4.23.0 init -b base -p nova -y --no-monorepo --no-rtl
   ```

   `-b base` picks Base UI. `-p nova` is the default preset, so the style becomes `base-nova` (preset code `b2fA`). `-d` is shorthand for `--template=next --preset=base-nova`. Init then:

   - writes `components.json`
   - adds `@base-ui/react`, `class-variance-authority`, `cn`, `lucide-react`, `shadcn`, `tw-animate-css`
   - writes `lib/utils.ts` with `export { cn } from "cn"`
   - rewrites `app/globals.css` (imports, `@custom-variant dark`, `@theme inline`, `:root`, `.dark`, `@layer base`)

   Run `git diff` after init. The "Updating fonts" step did not touch the probe's layout, but check that it left `app/layout.tsx` alone here.

4. Add the components.

   ```bash
   pnpm dlx shadcn@4.23.0 add button select tabs sidebar dialog progress scroll-area badge card tooltip input textarea separator toggle-group dropdown-menu popover calendar -y
   ```

   That writes 21 files. `sidebar` also brings `sheet`, `skeleton` and `hooks/use-mobile.ts`. `toggle-group` brings `toggle`. `calendar` adds `react-day-picker` and `date-fns`.

5. Replace `hooks/use-mobile.ts`. The generated hook fails `eslint-config-next` (rule `react-hooks/set-state-in-effect`). This version passes lint, tsc and build in the probe:

   ```ts
   import * as React from "react"

   const MOBILE_QUERY = "(max-width: 767px)"

   function subscribe(onChange: () => void) {
     const mql = window.matchMedia(MOBILE_QUERY)
     mql.addEventListener("change", onChange)
     return () => mql.removeEventListener("change", onChange)
   }

   export function useIsMobile() {
     return React.useSyncExternalStore(
       subscribe,
       () => window.matchMedia(MOBILE_QUERY).matches,
       () => false
     )
   }
   ```

   A later `shadcn add` of anything that depends on `use-mobile` overwrites this file. `add -a --dry-run` lists it as `~ hooks/use-mobile.ts overwrite`. Check the diff after every add.

6. Wire the root layout. Keep the existing `localFont` with `variable: "--font-sans"` and keep its class on `<html>`.

   ```tsx
   <html lang="en" className={timeless.variable}>
     <body className="relative">
       <div className="isolate">
         <TooltipProvider>{children}</TooltipProvider>
       </div>
     </body>
   </html>
   ```

   - `isolate` gives the app its own stacking context, so portaled popups always sit above page content (Base UI quick start).
   - `body { position: relative }` lets dialog backdrops cover the visual viewport on iOS 26+ Safari (Base UI quick start).
   - `TooltipProvider` is explained under Tooltip below.

7. Add ESLint so `pnpm lint` exists, using the TypeScript alias from the gotchas section. Then run `pnpm typecheck`, `pnpm lint` and `pnpm build`.

## components.json

Generated by step 3, verbatim:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

- `style` decides Base UI vs Radix. `base-*` styles pull from the Base UI registry (`registry/base-nova/...`). It cannot change after init.
- `tailwind.config` is empty because Tailwind v4 has no config file.
- `cssVariables: true` gives the semantic tokens below. It also cannot change after init.
- `npx shadcn@4.23.0 info` prints the resolved config. It shows `base: base`, preset `b2fA`, font `geist`, radius `default`.

## What init writes into globals.css

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-1: var(--chart-1); /* chart-1 to chart-5 */
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark { /* same names, dark values; --border and --input use oklch(1 0 0 / 10%) and 15% */ }

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; }
}
```

`shadcn/tailwind.css` ships in the `shadcn` npm package. It adds:

- the accordion keyframes
- the custom variants `data-open`, `data-closed`, `data-checked`, `data-unchecked`, `data-selected`, `data-disabled`, `data-active`, `data-horizontal`, `data-vertical`. Each matches both Radix (`data-state="open"`) and Base UI (`data-open`) attributes.
- the utilities `no-scrollbar`, `scroll-fade-*` and `shimmer`

## How the tokens map

Each shadcn token is a plain CSS variable on `:root`. `@theme inline` turns it into a Tailwind color, and the components only use the utilities.

| Variable | Utility | What uses it |
| --- | --- | --- |
| `--background` / `--foreground` | `bg-background`, `text-foreground` | `body`, outline button, calendar |
| `--card` / `--card-foreground` | `bg-card`, `text-card-foreground` | Card |
| `--popover` / `--popover-foreground` | `bg-popover`, `text-popover-foreground` | Select, DropdownMenu, Popover and Dialog surfaces |
| `--primary` / `--primary-foreground` | `bg-primary`, `text-primary-foreground` | default Button, Badge, Progress indicator |
| `--secondary` / `--secondary-foreground` | `bg-secondary` | secondary Button and Badge |
| `--muted` / `--muted-foreground` | `bg-muted`, `text-muted-foreground` | ghost hover, descriptions, placeholders, TabsList |
| `--accent` / `--accent-foreground` | `bg-accent` | focused menu and select items |
| `--destructive` | `text-destructive`, `bg-destructive/10` | destructive Button, `aria-invalid` styles |
| `--border` | `border-border` (set on `*` in `@layer base`) | every default border |
| `--input` | `border-input`, `dark:bg-input/30` | Input, Textarea, SelectTrigger |
| `--ring` | `ring-ring/50`, `outline-ring/50`, `focus-visible:border-ring` | focus rings everywhere |
| `--chart-1..5` | `bg-chart-1` and so on | Chart |
| `--sidebar`, `--sidebar-foreground` | `bg-sidebar`, `text-sidebar-foreground` | Sidebar panel |
| `--sidebar-primary(-foreground)` | `bg-sidebar-primary` | Sidebar brand or logo blocks |
| `--sidebar-accent(-foreground)` | `bg-sidebar-accent` | hovered and active `SidebarMenuButton` |
| `--sidebar-border`, `--sidebar-ring` | `border-sidebar-border`, `ring-sidebar-ring` | Sidebar separators and focus |

Radius: base-nova derives the whole scale from one value. `--radius: 0.625rem` (10px) gives `rounded-sm` 6px, `rounded-md` 8px, `rounded-lg` 10px, `rounded-xl` 14px, `rounded-2xl` 18px, `rounded-3xl` 22px and `rounded-4xl` 26px. Buttons use `rounded-lg`, cards and dialogs `rounded-xl`, badges `rounded-4xl`. Change `--radius` to move all of them together.

Opacity modifiers such as `bg-primary/80` compile to `color-mix(in oklab, ...)`, so OKLCH tokens keep working with alpha.

### Proposed Cue mapping

The Paper file is the source of truth. These are today's hex tokens from `app/globals.css`, converted to OKLCH, as a starting point for the foundation owner:

| Current token | Hex | OKLCH | Suggested shadcn variable |
| --- | --- | --- | --- |
| `--color-page` | #ffffff | `oklch(1 0 0)` | `--background`, `--card`, `--popover` |
| `--color-ink` | #141414 | `oklch(0.191 0 0)` | `--foreground`, `--primary` |
| `--color-graphite` | #6a6a66 | `oklch(0.523 0.0062 106.6)` | `--muted-foreground` |
| `--color-rule` | #e8e8e3 | `oklch(0.930 0.0067 106.5)` | `--border`, `--sidebar-border` |
| `--color-border` | #d6d6d0 | `oklch(0.874 0.0081 106.6)` | `--input` |
| `--color-wash` | #f6f6f3 | `oklch(0.972 0.0040 106.5)` | `--sidebar`, `--secondary` |
| `--color-fill` | #efefeb | `oklch(0.951 0.0053 106.5)` | `--muted`, `--accent`, `--sidebar-accent` |
| `--color-control` | #e6e6e3 | `oklch(0.924 0.0040 106.5)` | segmented-control track (custom token) |

Today's `--radius-sm: 6px` equals base-nova's `rounded-sm` when `--radius` stays at 0.625rem.

## How Tailwind v4 `@theme inline` works here

- `@theme { --color-x: ... }` defines a design token. Tailwind creates utilities from it (`bg-x`, `text-x`, `border-x`) and emits the variable on `:root` in `@layer theme`. A utility then reads `var(--color-x)`.
- `@theme inline` creates the same utilities, but writes the token's value into the utility. The compiled probe CSS has `.bg-background{background-color:var(--background)}` and `.rounded-lg{border-radius:var(--radius)}`.
- That is why shadcn uses `inline`. The utility reads `--background` where the element sits, so `.dark` or any scoped override of `--background` reaches it. Without `inline`, `--color-background: var(--background)` would resolve once on `:root`, and overrides further down would not show.
- The namespace sets the utility family. `--color-*` gives colors, `--radius-*` gives `rounded-*`, `--font-*` gives `font-*`, `--text-*` gives text sizes. Any app variable that uses these prefixes becomes part of Tailwind's theme. That is why step 2 renames the old tokens.
- To add a Cue-only token, declare the raw value on `:root` and map it in `@theme inline`. For example, `--control: oklch(0.924 0.004 106.5)` on `:root` plus `--color-control: var(--control)` gives `bg-control`.
- Fonts: the theme line `--font-sans: var(--font-sans)` refers to itself. It works because next/font's class sets `--font-sans` unlayered on `<html>`, and that beats the layered theme declaration. Keep the font class on `<html>`. On `<body>`, `html { font-family: var(--font-sans) }` would resolve to the cyclic value. Set `--font-mono` in `@theme inline` to Cue's own mono stack. Init points it at `--font-geist-mono`, which Cue does not load.

## Base UI vs Radix: what builders will trip on

TypeScript catches the first three items in the probe. Runtime catches two more. The rest fail silently.

### `asChild` is gone. Use `render`.

```tsx
// Radix
<DialogTrigger asChild><Button variant="outline">Open</Button></DialogTrigger>
// Base UI
<DialogTrigger render={<Button variant="outline" />}>Open</DialogTrigger>
```

- `render` takes an element or a function `(props, state) => element`. Children go on the part, not inside the render element.
- Base UI merges onto one node. Class names combine. Styles merge, with the render element winning. Both event handlers run, the render element's first. Refs all attach. Other shared attributes take the render element's value.
- A custom component passed to `render` must spread the props it receives onto its DOM node. In React 19 `ref` is an ordinary prop, so spreading `...props` is enough.
- `asChild` is a type error: "Property 'asChild' does not exist".
- Applies to `DialogTrigger`, `DialogClose`, `PopoverTrigger`, `TooltipTrigger`, `DropdownMenuTrigger`, `SelectPrimitive.Icon` and more. Badge and the sidebar parts (`SidebarMenuButton`, `SidebarGroupLabel`, `SidebarGroupAction`, `SidebarMenuAction`, `SidebarMenuSubButton`) take `render` through `useRender`.

### Links and `nativeButton`

- `<Button render={<Link href="/x" />}>` logs a console error: "A component that acts as a button expected a native <button> because the `nativeButton` prop is true." It passes `tsc`.
- shadcn's Button docs say not to use `<Button render={<a />} nativeButton={false} />` for links either. Base UI Button always sets `role="button"`, which overrides the link role.
- Do this for a link styled as a button:

  ```tsx
  <Link href="/calendar" className={buttonVariants({ variant: "ghost" })}>Calendar</Link>
  ```

- Sidebar navigation can render Next's Link directly, because `SidebarMenuButton` uses `useRender` and not Base UI Button: `<SidebarMenuButton render={<Link href="/" />} isActive tooltip="Today">`. Verified with no warnings.
- Use `nativeButton={false}` only when a trigger renders a non-button element that should still act as a button.

### Select

- Pass `items` to `<Select>` so `<SelectValue>` shows the label. Without `items`, the trigger shows the raw value, for example `math201`.

  ```tsx
  const courses = [{ label: "Linear algebra", value: "math201" }]
  <Select items={courses} value={course} onValueChange={setCourse}>
    <SelectTrigger className="w-56"><SelectValue placeholder="Pick a course" /></SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {courses.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
      </SelectGroup>
    </SelectContent>
  </Select>
  ```

- The empty value is `null`, not `""`. `onValueChange` has the signature `(value: T | null, eventDetails) => void`. A handler typed `(v: string) => ...` is a type error.
- Values can be objects. Use `itemToStringLabel` and `itemToStringValue`, or the `{ label, value }` shape.
- `multiple` turns the value into an array.
- With a placeholder, users cannot clear the choice. Add an item with `value: null` to make it clearable.
- `SelectContent` has `alignItemWithTrigger` set to true. The popup then overlaps the trigger so the selected item lines up with it, and `side` and `align` are ignored. Pass `alignItemWithTrigger={false}` for a normal dropdown below the trigger.
- Popup sizing uses Base UI variables: `--anchor-width`, `--available-height`, `--transform-origin`. These replace Radix's `--radix-select-trigger-width` and similar.

### Dialog and Sheet

- The parts are `Dialog.Popup` and `Dialog.Backdrop`, wrapped as `DialogContent` and `DialogOverlay`. `DialogContent` has `showCloseButton` (default true). `DialogFooter` has `showCloseButton` (default false).
- `onOpenChange(open, eventDetails)`. `eventDetails.reason` says what closed it, and `eventDetails.cancel()` stops the change.
- Radix's `onInteractOutside` and `onEscapeKeyDown` become `disablePointerDismissal` on the root, or a check on the reason in `onOpenChange`.
- Focus: `initialFocus` and `finalFocus` refs go on the Popup (`DialogContent`), replacing Radix's `onOpenAutoFocus` and `onCloseAutoFocus`.
- `modal` is `true | false | "trap-focus"`.
- `onOpenChangeComplete` fires after the exit animation.
- `Dialog.createHandle()` lets a trigger outside the root open it.

### Tooltip

- `TooltipProvider` is optional in Base UI. Nothing throws without it.
- It matters anyway. Without it a Base UI trigger waits its default 600ms. shadcn's `TooltipProvider` sets `delay={0}` and groups adjacent tooltips. The CLI prints "Remember to wrap your app with the TooltipProvider component".
- The Radix sidebar wrapped its own `TooltipProvider`. The Base UI `SidebarProvider` does not. Put one `TooltipProvider` in the root layout.
- `delay` and `closeDelay` live on the Provider or on `TooltipTrigger`, not on the root.
- `TooltipContent` takes `side`, `align`, `sideOffset` and `alignOffset`. They are passed to the Positioner.

### DropdownMenu (Base UI Menu)

- `DropdownMenuLabel` must sit inside `DropdownMenuGroup` (or `DropdownMenuRadioGroup`). Outside a group the page crashes: "Base UI: MenuGroupContext is missing. Menu group parts must be used within <Menu.Group> or <Menu.RadioGroup>." Verified. Types do not catch it.
- Items use `onClick`, not Radix's `onSelect`. `closeOnClick` (default true) keeps the menu open when false.
- Submenus are `DropdownMenuSub` (`Menu.SubmenuRoot`), `DropdownMenuSubTrigger` and `DropdownMenuSubContent`.
- `DropdownMenuItem` takes `variant="destructive"` and `inset`.
- `openOnHover` goes on the trigger.

### ToggleGroup, Tabs, Popover, Progress, ScrollArea

- ToggleGroup: the value is always `string[]`, even for single choice. There is no `type="single" | "multiple"`. Pass `multiple` for multi-select. `value="a"` is a type error. Use `value={["a"]}` and `onValueChange={(next: string[]) => ...}`.
- Tabs: `value` can be any type, and `defaultValue` defaults to `0`. Always pass `defaultValue` or `value` that matches a `TabsTrigger value`. The active tab has `data-active`, not `data-state="active"`. Tabs props: `TabsList variant="default" | "line"`, `orientation`.
- Popover: `modal` defaults to `false`. Hover opening is `openOnHover` on `PopoverTrigger`. `PopoverHeader`, `PopoverTitle` and `PopoverDescription` exist.
- Progress: `<Progress value={40} />` renders the track and indicator. Children go before the track, for example `<ProgressLabel>` and `<ProgressValue>`. `value={null}` means indeterminate.
- ScrollArea: `ScrollArea` wraps `Viewport`, `ScrollBar` and `Corner`. Give it a fixed height (`h-24`) or it will not scroll.

### State styling

- Base UI uses `data-open`, `data-closed`, `data-starting-style`, `data-ending-style`, `data-checked`, `data-active`, `data-disabled`, `data-side`, `data-align`. Radix uses `data-state`.
- In custom classes write `data-open:`, `data-active:` and the rest. `shadcn/tailwind.css` defines them. Avoid `data-[state=open]:`.
- Accordion height uses `--accordion-panel-height`.

### `cn` comes from a package

Generated components import `{ cn } from "cn"`. They do not use `@/lib/utils`. `lib/utils.ts` only re-exports it. Do not add clsx or tailwind-merge.

## Next 16 and React 19 gotchas

1. **create-next-app defaults differ from this repo.** A fresh 16.4.3 app turns on `cacheComponents: true`, `partialPrefetching: true` and the Turbopack Tailwind loader. This repo's `next.config.ts` has only `devIndicators: false`. Copy only the `turbopack.rules` block. Turning on Cache Components is an architecture decision.
2. **TypeScript 7 breaks ESLint.** `eslint-config-next` 16.4.3 loads typescript-eslint, which stops with "typescript-eslint does not support TS 7.0". The fix comes from the TypeScript 7 release notes and was verified in the probe. `tsc` stays 7.0.2, ESLint gets the 6.0 API, and lint, tsc and build all pass:

   ```json
   "devDependencies": {
     "typescript": "npm:@typescript/typescript6@^6.0.2",
     "@typescript/native": "npm:typescript@^7.0.2"
   }
   ```

   `node_modules/.bin/tsc` is then 7.0.2 and `tsc6` is 6.0.2. Next's own build-time type check runs and passes.
3. **`use-mobile.ts` fails lint.** See install step 5. A later `shadcn add` overwrites the fix.
4. **Stale route types break `next build`.** Delete a route after `next dev` has run, and `.next/dev/types/validator.ts` still imports it. tsconfig includes `.next/dev/types/**/*.ts`, so the build fails with "Cannot find module '../../../app/<route>/page.js'". Run `rm -rf .next` and build again.
5. **Sidebar cookie.** `SidebarProvider` writes `sidebar_state` to `document.cookie` on toggle. Reading it on the server needs `await cookies()` in a layout, which makes every route under it dynamic. With Cache Components on, that read must also sit inside `<Suspense>`. For Cue, prefer `defaultOpen` on the client and skip the server read.
6. **Server Components.** `button`, `badge`, `card`, `input`, `textarea` and `skeleton` have no `"use client"`. They render inside a Server Component, verified with a static `/rsc` page in the probe. You cannot pass event handlers to them from a server file. Everything with state or a popup has `"use client"`.
7. **`LayoutProps<"/">` and `PageProps`** are global types from Next 16 type generation. The probe layout uses them with no import.
8. **OKLCH check.** Generated components are clean except `bg-black/10` on the Dialog and Sheet overlays. Swap it for a token, for example `bg-foreground/10`, if `scripts/check-tokens.mjs` flags palette colors. Tailwind's compiled CSS contains `--color-black:#000`, and `shadcn/tailwind.css` has `#000` in its mask gradients. The check should scan source files (`app/`, `components/`, `lib/`), not `.next` or `node_modules`.
9. **Portals.** Popups portal to `document.body`. Without the `isolate` wrapper, a `z-index` in page content can cover them.

## shadcn MCP server

The current docs give this command for Claude Code. It was run in the probe, not in this repo.

```bash
pnpm dlx shadcn@latest mcp init --client claude
```

It writes `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": [
        "shadcn@latest",
        "mcp"
      ]
    }
  }
}
```

It also runs an install and moves `shadcn` from `dependencies` to `devDependencies`. The build still passes, because `shadcn/tailwind.css` is only needed at build time. Other clients: `--client cursor | vscode | codex | opencode`. Restart Claude Code after it runs, then check `/mcp`.

Status for this repo: not installed. It adds a project-level MCP integration and edits `package.json` and `pnpm-lock.yaml`. Both need the operator's go-ahead and fall outside a research-only task. Without the server, the CLI covers the same lookups: `shadcn view`, `shadcn search`, `shadcn docs`.

## Components in the Base UI registry

`pnpm dlx shadcn@4.23.0 search @shadcn -t registry:ui --json` in the base-nova probe returned 65 items:

accordion, alert, alert-dialog, aspect-ratio, attachment, avatar, badge, breadcrumb, bubble, button, button-group, calendar, card, carousel, chart, checkbox, code-block, collapsible, combobox, command, context-menu, dialog, direction, drawer, dropdown-menu, empty, field, form, hover-card, input, input-group, input-otp, item, kbd, label, marker, menubar, message, message-scroller, native-select, navigation-menu, pagination, popover, progress, questionnaire, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip, trace.

Notes from `add -a --dry-run` and `view`:

- `form` is an empty item in the Base UI registry, with no files. Use `field` (Base UI Field) for form layout and validation.
- `toast` is built on Base UI Toast: `Toaster`, a `toast` manager and `useToastManager`. `sonner` is still listed, but it pulls in `sonner` and `next-themes`, and `add -a` skips it. Prefer `toast`.
- `chart` adds `recharts@3.8.0`. `carousel` adds `embla-carousel-react`. `command` adds `cmdk`. `input-otp` adds `input-otp`. `resizable` adds `react-resizable-panels`. `code-block` adds `shiki` and `hooks/use-highlighted-code.ts`.
- Blocks: `sidebar-01` to `sidebar-16`, `login-01` to `login-05`, `dashboard-01`. Plus 68 `*-example` items. Install a block with `add sidebar-07` and read its source for patterns.

## Useful CLI commands

```bash
pnpm dlx shadcn@4.23.0 view select                 # registry JSON with file contents
pnpm dlx shadcn@4.23.0 docs select dialog tooltip  # docs, example and Base UI API links
pnpm dlx shadcn@4.23.0 search @shadcn -q sidebar   # find items and blocks
pnpm dlx shadcn@4.23.0 add select --dry-run        # files and deps it would touch
pnpm dlx shadcn@4.23.0 add select --diff           # diff against the local copy
pnpm dlx shadcn@4.23.0 info                        # resolved config and preset
```

The full Base UI docs ship inside the package as Markdown: `node_modules/@base-ui/react/docs/react/components/<name>.md`, plus `handbook/composition.md` and `utils/use-render.md`. They match the installed version. Read them before going to the web.

## Sources

- https://ui.shadcn.com/docs/installation/next
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/docs/cli
- https://ui.shadcn.com/docs/mcp
- https://ui.shadcn.com/docs/components/base/button
- https://ui.shadcn.com/docs/components/base/select
- https://ui.shadcn.com/docs/components/base/sidebar
- https://base-ui.com/react/components/select
- https://base-ui.com/react/components/tooltip
- https://base-ui.com/react/handbook/composition
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ (running side by side with TypeScript 6.0)
- `node_modules/@base-ui/react/docs` (1.9.0) and `node_modules/next/dist/docs` (16.4.3)
- CLI output from `shadcn@4.23.0`: `--help`, `init --help`, `add --help`, `search`, `view`, `docs`, `info`, `mcp init --help`
