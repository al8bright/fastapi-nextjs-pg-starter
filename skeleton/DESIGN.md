---
name: Precision UI
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#424752'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#727783'
  outline-variant: '#c2c6d4'
  surface-tint: '#005db6'
  primary: '#00478d'
  on-primary: '#ffffff'
  primary-container: '#005eb8'
  on-primary-container: '#c8daff'
  inverse-primary: '#a9c7ff'
  secondary: '#575f67'
  on-secondary: '#ffffff'
  secondary-container: '#d8e1ea'
  on-secondary-container: '#5b646b'
  tertiary: '#005055'
  on-tertiary: '#ffffff'
  tertiary-container: '#006a71'
  on-tertiary-container: '#73ecf6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#00468c'
  secondary-fixed: '#dbe4ed'
  secondary-fixed-dim: '#bfc8d0'
  on-secondary-fixed: '#141d23'
  on-secondary-fixed-variant: '#3f484f'
  tertiary-fixed: '#7df4ff'
  tertiary-fixed-dim: '#5dd8e2'
  on-tertiary-fixed: '#002022'
  on-tertiary-fixed-variant: '#004f54'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 48px
  xl: 80px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  max-width: 1440px
---

## Brand & Style
The brand personality is precise, composed, and technically confident. This design system targets people who work with dense, structured information — dashboards, admin consoles, and internal operations tools — and who value reliability and clarity over decoration. The visual direction follows a **Corporate / Modern** aesthetic with a lean toward **Minimalism**, ensuring that long lists, detail views, and multi-field forms stay legible and organized. The emotional response should be one of trust and orderliness: the interface feels engineered rather than styled. High information density is balanced with generous whitespace so that operators can scan a screen quickly without cognitive overload during repetitive workflows.

## Colors
The palette is rooted in a restrained, utilitarian blue. The primary **Deep Blue (#00478D, `primary`)** carries primary actions, brand moments, and the highlighting of key data points, with the brighter **#005EB8 (`primary-container`)** reserved for filled emphasis surfaces and **#005DB6 (`surface-tint`)** driving tonal overlays. The tertiary **Deep Teal (#005055, `tertiary` / #006A71, `tertiary-container`)** marks positive states, completion indicators, and subtle interactive accents, while the neutral **Slate Gray (#575F67, `secondary`)** supports secondary actions and interface chrome. The background architecture rests on a near-white **#F8F9FA (`surface` / `background`)** plus a graded stack of light grays (`surface-container-low` `#F3F4F5` through `surface-container-highest` `#E1E3E4`) to build quiet, high-contrast layers. Dark neutrals are used exclusively for text — `on-surface` `#191C1D` for primary copy and `on-surface-variant` `#424752` for supporting copy — to hold a strong accessibility margin. Interactive cards sit on `surface-container-lowest` (`#FFFFFF`) so they lift off the page, and destructive or invalid states use `error` `#BA1A1A` with the softer `error-container` `#FFDAD6` for inline messaging.

## Typography
This design system uses **Inter** throughout for its systematic, utilitarian character and exceptional legibility at small sizes — essential when technical values, identifiers, and numeric columns must be read without hesitation. Headlines use a semi-bold 600 weight with negative letter-spacing (`display-lg` at 48/56 and -0.02em, `headline-lg` at 32/40 and -0.01em, stepping down to 24/32 on mobile) for a controlled, authoritative look. Body copy is set with generous line-height — 18/28, 16/24, and 14/20 — so that long-form descriptions and help text stay comfortable to read. Labels use a heavier 600 weight at 14px with 0.05em tracking, typically rendered uppercase, to clearly separate metadata and field names from narrative content; `label-sm` at 12/16 handles captions and secondary annotations.

## Layout & Spacing
The layout follows a **Fixed Grid** model on desktop (12 columns) and a fluid 4-column model on mobile, capped at a 1440px content width. A strict 4px baseline grid (`spacing.base`) keeps component alignment technically precise.
- **Desktop:** 12 columns, 24px gutters, and 64px outside margins.
- **Tablet:** 8 columns, 24px gutters, and 32px outside margins.
- **Mobile:** 4 columns, 16px gutters, and 16px outside margins.
Vertical rhythm is maintained using 24px increments (md) to separate logical sections of a page, while 8px (xs) binds tight groupings of related inputs or key-value pairs. Larger 48px (lg) and 80px (xl) steps mark the boundaries between major regions such as page header, primary content, and footer.

## Elevation & Depth
Depth is communicated through **Tonal Layers** and **Low-Contrast Outlines**. In a data-dense interface, heavy shadows read as noise, so the primary method is a 1px border in `outline-variant` (`#C2C6D4`) to define containers, with the stronger `outline` (`#727783`) reserved for dividers that must survive at a glance.
- **Resting state:** Flat, 1px light border, no shadow.
- **Elevated state (interactive cards, list rows):** A very soft, ambient shadow (0px 4px 20px rgba(0,0,0,0.05)) applied only on hover to signal interactivity.
- **Overlays (modals, popovers):** High-diffusion shadow (0px 12px 40px rgba(0,0,0,0.1)) to separate decision-making layers from the page behind them.
Surface stacking always moves from darker (background) to lighter (interactive elements), so the most actionable element on screen is also the brightest.

## Shapes
The shape language is **Soft** (roundedness 1). This choice balances the rigidity of a data-driven tool with a modern, approachable software feel. Standard elements such as buttons, inputs, and selects use the 4px default radius (`rounded.DEFAULT`, 0.25rem), while 2px (`sm`, 0.125rem) is reserved for the smallest affordances like checkboxes and inline tags. Larger containers — cards, panels, and table wrappers — use 8px (`lg`, 0.5rem) to soften the overall interface, and modals and feature surfaces step up to 12px (`xl`, 0.75rem). Fully rounded shapes (`full`, 9999px) are limited to avatars, badges, and status pills so that roundness itself carries meaning.

## Components
- **Buttons:** Primary buttons are solid `#00478D` (`primary`) with `on-primary` white text. Secondary buttons use a 1px border of the primary color over a transparent background. Precision is conveyed through 16px horizontal padding and 12px vertical padding on a 4px radius.
- **Content Cards:** White (`surface-container-lowest`) background, 1px `outline-variant` border, and a 0.5s transition to a light shadow on hover. Media and thumbnails sit on a neutral `#F8F9FA` (`surface`) backdrop for consistency across mixed content.
- **Hierarchical Navigation:** A vertical "tree" style sidebar for sections and sub-sections. The active entry is indicated with a 3px left-border highlight in the primary blue plus a `surface-container` background.
- **Option Selection Lists:** For choosing among mutually exclusive settings, filters, or plan variants, use "row-based" radio items with explicit labels, an optional supporting line, and a subtle `surface-container-low` (`#F3F4F5`) background tint on hover.
- **Input Fields:** A 1px `outline-variant` border that transitions to the primary blue on focus, with `error` used for the invalid state. Labels are positioned strictly above the field for unambiguous data entry, and helper text uses `body-sm` in `on-surface-variant`.
- **Status Chips:** High-contrast background with bold `label-sm` text (for example, an "Active" chip on a light tertiary background with dark teal text, or a "Failed" chip using `error-container` with `on-error-container`) to give instant visual feedback on record state.
