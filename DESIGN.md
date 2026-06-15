# Bass Piknik — Design System

Source of truth for colors, type, components. Use exact values below — no invented colors.

## Colors

| Token | Value | Use |
|---|---|---|
| Ink (brand black) | `#16170F` | headlines, dark surfaces, footer bg, `brand` button |
| Brand green | `#9FE870` (`--primary`, tw `brand`) | accent, `brandGreen` button bg |
| Brand green-foreground | `#0a1305` | text on brand green |
| Accent green (text) | `#3C7A1E` | small uppercase labels/kickers ("EZEK MIND MI VAGYUNK", genre tags) |
| Gold | `#EBE05A` / fg `#323000` | CTA pills (tw `gold`) |
| Forest | `#163300` | dark green surface |
| Warm cream bg | `#F6F5EE` (`--background`) | app light bg |
| Warm ink fg | `#14160F` (`--foreground` / `--ink`) | body text |
| Pill dark | `#16170F` (`--pill`) | dark pill nav/buttons |

### Pastel quadrant set (fill / ink pairs)
- green: `#DDF2C6` / `#2C3A18`
- gold: `#F7EFC0` / `#3A3608`
- sky: `#D6E7F5` / `#15324A`
- peach: `#F8DEC2` / `#4A2E12`
- lavender: `#E7DFF6` / `#2E2350`
- rose: `#F6D9DE` / `#4A1820`

## Typography
- Font: Geist Sans (`font-sans`), Geist Mono for numbers/code.
- Headlines: `font-extrabold`, `tracking-tight`, `letterSpacing: -0.03em`. Sizes `text-3xl`/`sm:text-4xl` for section h2, `text-5xl`/`sm:text-7xl` uppercase for hero.
- Kickers/labels: `text-sm font-bold uppercase tracking-[3px]`, color `#3C7A1E`.
- Body: `text-lg leading-relaxed`, `text-muted-foreground` for secondary copy.

## Components (shadcn-based, `src/components/ui/`)
- **Button variants**: `brand` (solid `#16170F` pill, white text), `brandOutline` (2px `#16170F` border, transparent), `brandGreen` (solid brand green pill). Size `pill` for rounded CTA pills.
- **pastel-card**: `.pastel-card.is-*` utility classes for quadrant cards (rounded-3xl, soft shadow).
- **icon-circle**: white circular icon buttons, `3rem` (sm `2.25rem`).
- **pill-dark**: dark pill nav/buttons using `--pill`.

## Homepage layout pattern (hiibiza.com-style)
- `/hero-bg.png` green mesh gradient rendered as `fixed inset-0 z-0 h-screen w-screen object-cover` — stays put behind all scrolling content.
- Hero section: transparent bg, `h-screen`, centered content, no own background.
- Each subsequent section: `relative z-[1]`, **no** background (gradient shows through), `min-h-screen flex flex-col justify-center`.
- Section `<h2>` title: `sticky top-24 z-0`, centered (`text-center`), sits *behind* its section's content.
- Section content wrapped in `relative z-10` so it scrolls over the title; title gets carried off-screen when the next section arrives.
- No entrance/fade-in animations (`Reveal` removed).
- Anchor targets (`#events`, `#lineup`, `#about`) are plain marker `<div id="..." className="scroll-mt-20" />` placed before each section.

## Reusable components
- `EventCarousel`, `ArtistCarousel` (`src/components/public/`) — horizontal snap-scroll cards, dark `#16170F` card chrome, brand-green CTA pill inside artist cards.
- `SiteHeader` — fixed floating pill nav (Framer export), `top-4 z-[2]`.
