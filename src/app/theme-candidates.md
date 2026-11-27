# Theme candidates - an archive of the choice

A reference in case we come back: this holds **every option that was considered**,
with exact values, so any of them can be applied again without picking it a second
time. The current choice is described in the [README next to this file](./README.md#ink-theme);
this file holds only the rejected and the spare ones.

Why the file exists: a prototype on two cards and the app on 48 companies with long
addresses look different, so the decision may change after working on real data.

Everything below is checked on the Companies screen. How to apply any set:
["How to swap the theme"](#how-to-swap-the-theme) at the end.

## Chosen

| Part | Value |
| --- | --- |
| Palette | Ink |
| Headings | Space Grotesk 600, letter-spacing -0.03em |
| Logo | Fraunces 600, letter-spacing -0.014em |
| Body | Instrument Sans |
| Addresses | IBM Plex Mono |
| Badges | Solid - filled with the token, text `*-foreground` |

## Palettes

Nine sets. The token names are those in
`node_modules/@heroui/styles/dist/themes/default/variables.css`; only the base ones
need overriding, HeroUI computes the derived ones (`*-hover`, `*-soft`,
`border-secondary`) with `color-mix` itself.

**A limit that applies to all:** the `accent` hue must not come close to `success`
(~150), `warning` (~66) and `danger` (~26) - otherwise a button glows in the same colour
as a status badge. Free ranges: blue 230-270, cyan 195-215, violet 275-300, magenta
330-345. That is exactly why the amber accent option dropped out.

| Set | Accent (hue) | Neutral | Radius | Fonts |
| --- | --- | --- | --- | --- |
| **Ink** (chosen) | no hue | chroma <= 0.006, hue 250 | 4px | Instrument Sans + Instrument Serif |
| Unread | azure 238 | chroma 0.002-0.007, hue 250 | 6px | Inter Tight + IBM Plex Mono |
| Dossier | cyan 204 | chroma 0.002-0.011, hue 70-82 | 8px | Source Sans 3 + Newsreader |
| Manuscript | indigo 272 | chroma 0.004-0.014, hue 62-80 | 10px | Source Sans 3 + Fraunces |
| Nordic | sky 232 | chroma 0.006-0.025, hue 240-248 | 12px | DM Sans |
| Reader | violet 288 | chroma 0.004-0.018, hue 282-288 | 6px | Source Serif 4 (the whole UI) |
| Carbon | cyan 196 | chroma 0.004-0.013, hue 230-242 | 8px | Inter + Geist Mono |
| Porcelain | blue 252 | chroma 0.002-0.010, hue 250-252 | 14px | Instrument Sans |
| Oxide | plum 352 | chroma 0.002-0.014, hue 40-60 | 6px | Inter Tight + Bricolage Grotesque |

Removed already in the first round: **Queue** (violet 284, IBM Plex Sans, radius 2px,
monospaced platform names) and **Signal** (magenta 342, Manrope, radius 14px).

### What sets each one apart

- **Unread** - colour means state: a neutral with almost no hue, so the single
  saturated spot reads as "something new here".
- **Dossier** - 48 companies as a card index: the name is set like a document title,
  addresses and filter parameters in small monospace, like a note.
- **Manuscript** - a cool accent on warm sepia, like paper and blue ink.
- **Nordic** - the only one where the neutral has a visible hue (chroma up to 0.025).
- **Reader** - an interface entirely in serifs: the Companies screen is mostly text.
- **Carbon** - the only one designed from the dark scheme, the light one derived from it.
- **Porcelain** - space sets the boundaries: `--border` almost matches `--surface`, so
  the input field is made darker than the card, otherwise it is invisible.
- **Oxide** - the only warm accent. Plum 352 against danger 28 is only 36 degrees apart,
  so it is taken noticeably darker (0.448 against 0.555). Check it with the Delete
  button next to Add company.

### Full token sets

The light scheme in `:root`, the dark one in `.dark, [data-theme="dark"]`. Ink is not
here - it is in [`globals.css`](./globals.css).
#### Unread

```css
/* light */
--radius: 0.375rem;
--background: oklch(0.979 0.002 250);
--foreground: oklch(0.205 0.005 250);
--surface: oklch(1 0 0);
--muted: oklch(0.508 0.007 250);
--default: oklch(0.942 0.003 250);
--default-foreground: oklch(0.205 0.005 250);
--field-background: oklch(1 0 0);
--field-foreground: oklch(0.205 0.005 250);
--field-placeholder: oklch(0.578 0.007 250);
--border: oklch(0.896 0.004 250);
--separator: oklch(0.925 0.003 250);
--accent: oklch(0.528 0.188 238);
--accent-foreground: oklch(0.99 0.005 238);
--success: oklch(0.582 0.125 150);
--warning: oklch(0.698 0.148 66);
--danger: oklch(0.572 0.208 26);
/* dark */
--background: oklch(0.148 0.004 250);
--foreground: oklch(0.968 0.002 250);
--surface: oklch(0.196 0.005 250);
--muted: oklch(0.698 0.007 250);
--default: oklch(0.258 0.006 250);
--default-foreground: oklch(0.968 0.002 250);
--field-background: oklch(0.196 0.005 250);
--field-foreground: oklch(0.968 0.002 250);
--field-placeholder: oklch(0.648 0.007 250);
--border: oklch(0.278 0.006 250);
--separator: oklch(0.238 0.005 250);
--accent: oklch(0.652 0.172 238);
--accent-foreground: oklch(0.145 0.032 238);
--success: oklch(0.722 0.138 150);
--warning: oklch(0.805 0.14 66);
--danger: oklch(0.652 0.19 26);
```

#### Dossier

```css
/* light */
--radius: 0.5rem;
--background: oklch(0.971 0.004 82);
--foreground: oklch(0.228 0.008 70);
--surface: oklch(0.993 0.002 82);
--muted: oklch(0.498 0.01 72);
--default: oklch(0.938 0.006 82);
--field-placeholder: oklch(0.568 0.009 72);
--border: oklch(0.888 0.008 78);
--separator: oklch(0.918 0.006 80);
--accent: oklch(0.472 0.092 204);
--accent-foreground: oklch(0.985 0.006 204);
--success: oklch(0.552 0.108 148);
--warning: oklch(0.672 0.135 60);
--danger: oklch(0.538 0.172 28);
/* dark */
--background: oklch(0.172 0.006 70);
--foreground: oklch(0.958 0.004 82);
--surface: oklch(0.224 0.007 70);
--muted: oklch(0.698 0.011 72);
--default: oklch(0.278 0.008 70);
--field-placeholder: oklch(0.648 0.01 72);
--border: oklch(0.298 0.008 70);
--separator: oklch(0.258 0.007 70);
--accent: oklch(0.692 0.108 204);
--accent-foreground: oklch(0.165 0.026 204);
--success: oklch(0.708 0.118 148);
--warning: oklch(0.792 0.128 66);
--danger: oklch(0.638 0.172 28);
```

#### Manuscript

```css
/* light */
--radius: 0.625rem;
--background: oklch(0.966 0.008 78);
--foreground: oklch(0.235 0.014 62);
--surface: oklch(0.992 0.004 80);
--muted: oklch(0.502 0.015 68);
--default: oklch(0.935 0.011 78);
--field-placeholder: oklch(0.572 0.014 68);
--border: oklch(0.882 0.014 74);
--separator: oklch(0.913 0.011 76);
--accent: oklch(0.472 0.168 272);
--accent-foreground: oklch(0.985 0.006 272);
--success: oklch(0.548 0.112 148);
--warning: oklch(0.668 0.14 58);
--danger: oklch(0.535 0.178 28);
/* dark */
--background: oklch(0.178 0.01 68);
--foreground: oklch(0.955 0.008 80);
--surface: oklch(0.228 0.011 68);
--muted: oklch(0.698 0.016 70);
--default: oklch(0.282 0.012 68);
--field-placeholder: oklch(0.645 0.015 70);
--border: oklch(0.302 0.012 68);
--separator: oklch(0.262 0.011 68);
--accent: oklch(0.692 0.158 272);
--accent-foreground: oklch(0.162 0.03 272);
--success: oklch(0.705 0.122 148);
--warning: oklch(0.79 0.132 64);
--danger: oklch(0.635 0.178 28);
```

#### Nordic

```css
/* light */
--radius: 0.75rem;
--background: oklch(0.972 0.008 240);
--foreground: oklch(0.222 0.021 248);
--surface: oklch(0.998 0.003 240);
--muted: oklch(0.515 0.024 246);
--default: oklch(0.94 0.012 240);
--field-placeholder: oklch(0.585 0.022 246);
--border: oklch(0.892 0.016 242);
--separator: oklch(0.922 0.012 242);
--accent: oklch(0.558 0.158 232);
--accent-foreground: oklch(0.995 0.004 232);
--success: oklch(0.585 0.118 152);
--warning: oklch(0.702 0.142 66);
--danger: oklch(0.575 0.2 24);
/* dark */
--background: oklch(0.165 0.018 248);
--foreground: oklch(0.962 0.006 240);
--surface: oklch(0.218 0.022 248);
--muted: oklch(0.705 0.024 246);
--default: oklch(0.272 0.024 248);
--field-placeholder: oklch(0.652 0.022 246);
--border: oklch(0.292 0.025 248);
--separator: oklch(0.248 0.022 248);
--accent: oklch(0.692 0.142 232);
--accent-foreground: oklch(0.155 0.035 240);
--success: oklch(0.725 0.13 152);
--warning: oklch(0.805 0.135 66);
--danger: oklch(0.655 0.185 24);
```

#### Reader

```css
/* light */
--radius: 0.375rem;
--background: oklch(0.974 0.004 282);
--foreground: oklch(0.212 0.016 288);
--surface: oklch(1 0 0);
--muted: oklch(0.505 0.018 286);
--default: oklch(0.94 0.007 282);
--field-placeholder: oklch(0.575 0.017 286);
--border: oklch(0.892 0.009 284);
--separator: oklch(0.922 0.007 284);
--accent: oklch(0.468 0.178 288);
--accent-foreground: oklch(0.99 0.005 288);
--success: oklch(0.572 0.122 150);
--warning: oklch(0.695 0.145 64);
--danger: oklch(0.568 0.205 25);
/* dark */
--background: oklch(0.152 0.012 288);
--foreground: oklch(0.965 0.004 282);
--surface: oklch(0.202 0.014 288);
--muted: oklch(0.698 0.018 286);
--default: oklch(0.258 0.016 288);
--field-placeholder: oklch(0.645 0.017 286);
--border: oklch(0.278 0.017 288);
--separator: oklch(0.238 0.015 288);
--accent: oklch(0.688 0.165 288);
--accent-foreground: oklch(0.152 0.035 288);
--success: oklch(0.722 0.132 150);
--warning: oklch(0.8 0.138 64);
--danger: oklch(0.648 0.188 25);
```

#### Carbon

```css
/* light */
--radius: 0.5rem;
--background: oklch(0.962 0.004 230);
--foreground: oklch(0.198 0.012 240);
--surface: oklch(1 0 0);
--muted: oklch(0.498 0.014 238);
--default: oklch(0.934 0.006 230);
--field-placeholder: oklch(0.568 0.013 238);
--border: oklch(0.885 0.008 232);
--separator: oklch(0.916 0.006 232);
--accent: oklch(0.512 0.112 205);
--accent-foreground: oklch(0.99 0.005 205);
--success: oklch(0.578 0.125 152);
--warning: oklch(0.695 0.145 62);
--danger: oklch(0.568 0.205 25);
/* dark */
--background: oklch(0.132 0.008 242);
--foreground: oklch(0.968 0.004 230);
--surface: oklch(0.182 0.01 242);
--muted: oklch(0.692 0.014 238);
--default: oklch(0.245 0.012 242);
--field-placeholder: oklch(0.638 0.013 238);
--border: oklch(0.265 0.013 242);
--separator: oklch(0.222 0.011 242);
--accent: oklch(0.782 0.128 196);
--accent-foreground: oklch(0.142 0.03 200);
--success: oklch(0.728 0.138 152);
--warning: oklch(0.805 0.138 62);
--danger: oklch(0.652 0.19 25);
```

#### Porcelain

```css
/* light */
--radius: 0.875rem;
--background: oklch(0.988 0.002 250);
--foreground: oklch(0.215 0.008 252);
--surface: oklch(1 0 0);
--muted: oklch(0.528 0.01 252);
--default: oklch(0.955 0.003 250);
--field-background: oklch(0.968 0.003 250); /* darker than the card - on purpose */
--field-placeholder: oklch(0.595 0.009 252);
--border: oklch(0.938 0.003 250); /* almost = surface */
--separator: oklch(0.955 0.002 250);
--accent: oklch(0.535 0.192 252);
--accent-foreground: oklch(0.99 0.005 252);
--success: oklch(0.578 0.125 152);
--warning: oklch(0.698 0.146 66);
--danger: oklch(0.572 0.205 25);
/* dark */
--background: oklch(0.158 0.006 252);
--foreground: oklch(0.968 0.003 250);
--surface: oklch(0.205 0.008 252);
--muted: oklch(0.705 0.01 252);
--default: oklch(0.255 0.009 252);
--field-background: oklch(0.238 0.009 252);
--field-placeholder: oklch(0.652 0.01 252);
--border: oklch(0.235 0.008 252);
--separator: oklch(0.215 0.007 252);
--accent: oklch(0.665 0.175 252);
--accent-foreground: oklch(0.152 0.035 252);
--success: oklch(0.722 0.135 152);
--warning: oklch(0.805 0.14 66);
--danger: oklch(0.652 0.19 25);
```

#### Oxide

```css
/* light */
--radius: 0.375rem;
--background: oklch(0.968 0.005 60);
--foreground: oklch(0.228 0.012 40);
--surface: oklch(0.995 0.002 60);
--muted: oklch(0.502 0.014 45);
--default: oklch(0.938 0.007 60);
--field-placeholder: oklch(0.572 0.013 45);
--border: oklch(0.885 0.009 55);
--separator: oklch(0.915 0.007 58);
--accent: oklch(0.448 0.142 352);
--accent-foreground: oklch(0.985 0.006 352);
--success: oklch(0.552 0.112 150);
--warning: oklch(0.672 0.138 60);
--danger: oklch(0.555 0.195 28);
/* dark */
--background: oklch(0.172 0.008 45);
--foreground: oklch(0.955 0.005 60);
--surface: oklch(0.222 0.009 45);
--muted: oklch(0.695 0.014 48);
--default: oklch(0.278 0.01 45);
--field-placeholder: oklch(0.642 0.013 48);
--border: oklch(0.298 0.011 45);
--separator: oklch(0.258 0.01 45);
--accent: oklch(0.672 0.148 352);
--accent-foreground: oklch(0.158 0.032 352);
--success: oklch(0.708 0.122 150);
--warning: oklch(0.792 0.13 64);
--danger: oklch(0.642 0.185 28);
```

## Heading fonts

Ten candidates, all from Google Fonts. `weight` and `letter-spacing` are tuned to each
family: the same values on a Didone and on a grotesque give different results.
Cyrillic was not checked for any of them - the main version is English.

| Font | `next/font/google` | Weight | letter-spacing | What sets it apart |
| --- | --- | --- | --- | --- |
| **Space Grotesk** (chosen) | `Space_Grotesk` | 600 | -0.03em | Cut corners, a narrow "a". Holds the sharp 4px radius better than any serif |
| Instrument Sans | `Instrument_Sans` | 600 | -0.022em | The same as the body - no separate font needed at all |
| Fraunces | `Fraunces` | 600 | -0.014em | A variable serif with "wonk": uneven serifs, the name looks handwritten |
| Newsreader | `Newsreader` | 500 | -0.004em | A narrow screen serif, saves room in long names |
| Source Serif 4 | `Source_Serif_4` | 600 | -0.012em | A sturdy text serif, good at both 30px and 18px |
| Lora | `Lora` | 600 | -0.008em | A "brush" in the curves, warmer than Source Serif |
| Playfair Display | `Playfair_Display` | 600 | -0.018em | A Didone; thin strokes crumble at 18px. Worn out in templates |
| DM Serif Display | `DM_Serif_Display` | 400 | -0.016em | One weight, no bold exists. Headings only |
| Bricolage Grotesque | `Bricolage_Grotesque` | 700 | -0.03em | Uneven letter widths, reads as a logo on h1 |
| Archivo | `Archivo` | 700 | -0.028em | A dense news grotesque, narrower than Instrument Sans |

**Instrument Serif** (`Instrument_Serif`, weight 400, -0.005em) was first in the theme
and was rejected by the author. It has only one weight, so `font-bold` gives synthetic
bold - hence the rule "hierarchy by size, not weight", which stayed with Space Grotesk too.

## Logo fonts

The "Job Digger" wordmark in the header was chosen separately from the headings: the
last round had two candidates, each paired with each heading font.

| Font | `next/font/google` | Weight | letter-spacing |
| --- | --- | --- | --- |
| **Fraunces** (chosen) | `Fraunces` | 600 | -0.014em |
| Playfair Display | `Playfair_Display` | 600 | -0.018em |

## Status badges

Four densities. The key rule: `*-soft` and `*-soft-foreground` come from one token, so
the denser the background, the closer the text has to be to the page's `--foreground`
- otherwise the text merges with the background into a blob. The percentages differ
between the schemes, because their `--foreground` is opposite.

| Treatment | Background | Text (light / dark) | Ring |
| --- | --- | --- | --- |
| **Solid** (chosen) | filled with the token | `*-foreground` | - |
| Soft 24% | 24% | 92% / 92% | 35% |
| Soft 50% | 50% | 55% / 28% | 70% |
| Soft 75% | 75% | 28% / 15% | 100% |

Rejected earlier: **Soft 15%** (what HeroUI computes by default: text 70/80%) and
**Vibrant** - the built-in `[data-vibrant-palette="true"]`, which raises
`*-soft-foreground` to 92% without a single line in the theme.

Formulas for the muted treatments:

```css
--<colour>-soft: color-mix(in oklab, var(--<colour>) <background>%, transparent);
--<colour>-soft-foreground: color-mix(in oklab, var(--<colour>) <text>%, var(--foreground));
--<colour>-soft-ring: color-mix(in oklab, var(--<colour>) <ring>%, transparent);
```

HeroUI has no `--*-soft-ring` - it is our token, in case a ring is ever needed.

## Geometry

What had to be overridden, and why: details in the
[README](./README.md#ink-theme).

| What | HeroUI default | Ours |
| --- | --- | --- |
| Button | `rounded-3xl` = `--radius * 3` = 12px | 4px through `--radius-3xl` |
| Card | `min(32px, --radius-3xl)` = 12px | 6px, by overriding `.card` |
| Card border | none at all, only a shadow | 1px `var(--border)` |
| Button hover | `accent 90% + accent-foreground 10%` | explicit values |

## How to swap the theme

1. Take a token set above and replace the `:root` and `.dark` blocks in
   [`globals.css`](./globals.css) with it. Do not carry over the derived tokens - HeroUI
   computes them itself.
2. Fonts are in [`layout.tsx`](./layout.tsx): the family names from the tables above,
   `subsets: ["latin", "latin-ext"]`.
3. Check `npm run build`: it fails if a family, weight or subset does not exist.
4. Reread whether the statements about the theme in the
   [README](./README.md#ink-theme) have become untrue - in particular about the hueless
   accent and the `--info` token, because they hold only for Ink.

Step 4 matters most: `--info` exists precisely because the accent in Ink has no hue. In
a set with a coloured accent this token is not needed, and the "new" badge should take
the accent.
