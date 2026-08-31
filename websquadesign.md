---
name: Agnostic SaaS Blueprint
colors:
  background-base: '#121214'
  surface-primary: '#1e1e24'
  surface-hover: '#25252b'
  surface-raised: '#2a2a32'
  surface-input: 'rgba(0,0,0, 0.2)'
  text-primary: '#e4e4e7'
  text-secondary: '#a1a1aa'
  text-muted: '#71717a'
  border-subtle: 'rgba(255,255,255, 0.03)'
  border-default: 'rgba(255,255,255, 0.05)'
  border-strong: 'rgba(255,255,255, 0.1)'
  accent-primary: '#6366f1'
  accent-hover: '#4f46e5'
  success: '#22c55e'
  danger: '#ef4444'
  warning: '#f59e0b'
  info: '#3b82f6'
  background-base-light: '#f8fafc'
  surface-primary-light: '#ffffff'
  surface-hover-light: '#f1f5f9'
  surface-raised-light: '#ffffff'
  surface-input-light: '#ffffff'
  text-primary-light: '#0f172a'
  text-secondary-light: '#64748b'
  text-muted-light: '#94a3b8'
  border-subtle-light: '#f1f5f9'
  border-default-light: '#e2e8f0'
  border-strong-light: '#cbd5e1'
typography:
  headline-lg:
    fontFamily: Helvetica Neue
    fontSize: 32px
    fontWeight: '600'
    letterSpacing: -0.025em
  headline-sm:
    fontFamily: Helvetica Neue
    fontSize: 20px
    fontWeight: '600'
    letterSpacing: -0.025em
  body-lg:
    fontFamily: Helvetica Neue
    fontSize: 16px
    fontWeight: '400'
  body-md:
    fontFamily: Helvetica Neue
    fontSize: 14px
    fontWeight: '400'
  micro-overline:
    fontFamily: Helvetica Neue
    fontSize: 12px
    fontWeight: '600'
    letterSpacing: 0.05em
  data-mono:
    fontFamily: SF Mono
    fontSize: 13px
    fontWeight: '400'
rounded:
  sm: 4px
  md: 8px
  lg: 16px
  pill: 9999px
  full: 50%
spacing:
  space-1: 4px
  space-2: 8px
  space-3: 12px
  space-4: 16px
  space-6: 24px
  space-8: 32px
  space-12: 48px
---

# Agnostic Design System & SaaS Blueprint

This document defines the core design tokens, atomic components, and complex organisms for scalable SaaS applications. It is framework-agnostic.

Instead of dictating exact pages (like a CRM or Newsletter), this system defines the **building blocks** (tables, filters, metric cards, sidebars) required to construct *any* of those interfaces.

---

## 1. Design Tokens (Light/Dark Schema)

The system is designed for both Soft Dark and Off-White Light themes. Implementations should use CSS Variables (or equivalent framework mapping) to toggle these values based on `data-theme="light|dark"`.

### Colors: Surfaces & Text
| Token | Dark Theme (Default) | Light Theme (Off-White) | Usage |
| :--- | :--- | :--- | :--- |
| `background-base` | `#121214` | `#f8fafc` (Slate 50) | App background, behind everything |
| `surface-primary` | `#1e1e24` | `#ffffff` | Standard cards, sidebars |
| `surface-hover` | `#25252b` | `#f1f5f9` (Slate 100) | Row hovers, interactive cards |
| `surface-raised` | `#2a2a32` | `#ffffff` | Dropdowns, popovers, modals |
| `surface-input` | `rgba(0,0,0, 0.2)` | `#ffffff` | Form fields |
| `text-primary` | `#e4e4e7` (Zinc 200) | `#0f172a` (Slate 900) | Headings, primary data |
| `text-secondary` | `#a1a1aa` (Zinc 400) | `#64748b` (Slate 500) | Labels, table headers, helper text |
| `text-muted` | `#71717a` (Zinc 500) | `#94a3b8` (Slate 400) | Disabled text, placeholders |

### Colors: Brand & Semantics
*Note: These colors generally remain consistent across themes, but light theme may require slightly darker variants for contrast against white backgrounds.*
*   **Brand**: `accent-primary`: `#6366f1` (Indigo). `accent-hover`: `#4f46e5`.
*   **Semantics**:
    *   `success`: `#22c55e` (Online, Paid, Delivered)
    *   `danger`: `#ef4444` (Offline, Failed, Delete)
    *   `warning`: `#f59e0b` (Pending, Draft, Alert)
    *   `info`: `#3b82f6` (Processing, Active)
*   **Status Badges**: Use 10-15% opacity of Semantic colors for backgrounds, and 100% for text/borders.

### Colors: Borders
| Token | Dark Theme | Light Theme | Usage |
| :--- | :--- | :--- | :--- |
| `border-subtle` | `rgba(255,255,255, 0.03)` | `#f1f5f9` (Slate 100) | Dividers in tight lists |
| `border-default` | `rgba(255,255,255, 0.05)` | `#e2e8f0` (Slate 200) | Standard card/table borders |
| `border-strong` | `rgba(255,255,255, 0.1)` | `#cbd5e1` (Slate 300) | Inputs, buttons |

---

## 2. Scales & Metrics

### Spacing (8pt Grid)
*   `space-1`: 4px
*   `space-2`: 8px
*   `space-3`: 12px
*   `space-4`: 16px (Standard padding)
*   `space-6`: 24px (Section gaps)
*   `space-8`: 32px (Page padding)
*   `space-12`: 48px

### Border Radius (Radii)
*   `radius-sm`: `4px` (Checkboxes, small indicators)
*   `radius-md`: `8px` (Inputs, select menus, standard buttons)
*   `radius-lg`: `16px` (Cards, Modals, Table containers)
*   `radius-pill`: `9999px` (Badges, tags, toggle switches)
*   `radius-full`: `50%` (Avatars, circular icons)

### Typography
*   `font-sans`: `'Helvetica Neue', Helvetica, Arial, sans-serif`
*   `font-mono`: `'SF Mono', 'Menlo', monospace` (Required for IP addresses, IDs, metrics, tabular data).
*   **Styles**:

| Role | Font | Size | Weight | Letter Spacing | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Headline LG | `font-sans` | `2rem` (32px) | 600 | -0.025em | Page titles |
| Headline SM | `font-sans` | `1.25rem` (20px) | 600 | -0.025em | Section and card titles |
| Body LG | `font-sans` | `1rem` (16px) | 400 | 0 | Standard content |
| Body MD | `font-sans` | `0.875rem` (14px) | 400 | 0 | Dense UI copy |
| Micro/Overline | `font-sans` | `0.75rem` (12px) | 600 | 0.05em | Uppercase; labels, table headers, `text-secondary` |
| Data Mono | `font-mono` | `13px` | 400 | 0 | IDs, metrics, tabular data |

### Shadows & Elevation
| Level | Treatment | Use |
| :--- | :--- | :--- |
| Flat (L0) | None; rely on `border-default` | Base surfaces (dark mode relies on borders, not shadows) |
| Raised (L1) | `shadow-sm`: `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Cards in light mode |
| Floating (L2) | `shadow-md`: `0 4px 6px -1px rgba(0, 0, 0, 0.1)` | Hovered cards, dropdowns |
| Modal (L3) | `shadow-lg`: `0 10px 15px -3px rgba(0, 0, 0, 0.1)` | Modals, slide-overs |

*   **Z-Index**: `z-base: 0`, `z-dropdown: 40`, `z-sticky: 50`, `z-modal: 100`.

### Animation & Transitions
*   `duration-fast`: `150ms` (Hovers, active states).
*   `duration-normal`: `250ms` (Modals, drawers opening).
*   `duration-slow`: `350ms` (Complex page transitions).
*   `ease-out`: Use for elements entering the screen.
*   `ease-in`: Use for elements leaving the screen.

---

## 3. Atomic Components

### Status Badges & Tags
*   **Base**: Radius `radius-pill`, Font size `0.75rem`, Padding `2px 8px`, Font weight `500`.
*   **Variants**: Text color matches Semantic token, Background is Semantic token at 10% opacity.

### Buttons
*   **Primary**: Solid `accent-primary` with white text, radius `radius-md`. Hover: `accent-hover`. Disabled: `surface-hover` background, `text-muted` text, cursor `not-allowed`.
*   **Secondary**: `surface-primary` background, `border-strong` border, `text-primary` text. Hover: `surface-hover` background. Disabled: `text-muted` text and border.

### Forms & Controls
*   **Inputs/Selects**: Radius `radius-md`, border `border-strong`, background `surface-input`. Focus state: `outline: 2px solid accent-primary; outline-offset: 1px`. Error state: border `danger`. Disabled state: background `surface-hover`, text `text-muted`, cursor `not-allowed`.
*   **Search Bar**: Input with left-padding for a search icon (magnifying glass).
*   **Toggles/Switches**: Pill-shaped background (`border-strong`), sliding circular knob (`surface-primary`). Active state background becomes `accent-primary`.

### Iconography
*   Standardize sizes: `icon-sm` (16px), `icon-md` (20px), `icon-lg` (24px). Standard stroke width `1.5px` to `2px`.

---

## 4. Complex Organisms (SaaS Blocks)

### 1. Data Tables
*   **Container**: Background `surface-primary`, border `border-default`, radius `radius-lg`. Overflow hidden.
*   **Header Row (`<th>`)**: Text uses *Micro/Overline*. Border-bottom `border-strong`.
*   **Body Rows (`<tr>`)**: Border-bottom `border-default`. Hover background `surface-hover`. Cursor `pointer` if clickable.
*   **Cells (`<td>`)**: Padding `space-4`. Right-align numbers using `font-mono`.

### 2. Modals & Slide-over Drawers
*   **Overlay**: Fixed inset-0, background `rgba(0,0,0,0.5)`, backdrop-blur (optional). Z-index `z-modal`.
*   **Modal Body**: Centered, background `surface-raised`, radius `radius-lg`, shadow `shadow-lg`. Max-width varies (e.g., 400px for alerts, 800px for forms).
*   **Slide-over**: Anchored right, full height, width 400px. Slides in `ease-out` `duration-normal`.

### 3. Tabs & Navigation
*   **Layout**: Flex row, gap `space-4`, border-bottom `border-default`.
*   **Item**: Padding-bottom `space-2`, text `text-secondary`.
*   **Active State**: Text `text-primary`, border-bottom (2px) `accent-primary`.

### 4. Toasts / Notifications
*   **Position**: Fixed, usually bottom-right or top-center. Z-index `z-modal`.
*   **Container**: Background `surface-raised`, radius `radius-md`, shadow `shadow-md`, border left (4px) matching the semantic status color (Success/Danger).

### 5. Skeleton Loaders
*   **Style**: Background `surface-hover` or `border-strong`.
*   **Animation**: Pulse opacity (100% to 50%) infinitely.
*   **Shape**: Match expected content (circles for avatars, rounded rects for text lines).

---

## 5. Responsive Behavior

*Breakpoints are derived defaults — the system is layout-agnostic; adjust per implementation.*

| Name | Width | Key Changes |
| :--- | :--- | :--- |
| Mobile | `< 640px` | Single column, full-width cards, `space-4` (16px) page padding, modals and slide-overs become full-width sheets |
| Tablet | `640px – 1024px` | 2-column card grids, `space-6` (24px) page padding, compact horizontal navigation |
| Desktop | `> 1024px` | Multi-column grids, `space-8` (32px) page padding, full navigation and toolbars |

### Touch Targets
*   Minimum touch target: `44px × 44px` for buttons, inputs, and interactive icons.
*   Minimum spacing between adjacent targets: `space-2` (8px).

### Collapsing Strategy
*   Data tables scroll horizontally inside their container, or collapse rows to stacked key-value cards on mobile.
*   Slide-over drawers and modals expand to full-width sheets on mobile.
*   Tabs scroll horizontally rather than wrapping.

## 6. Do's and Don'ts

### Do
*   Map every color to a CSS variable and toggle themes via `data-theme` — components consume tokens only.
*   Right-align numeric and monetary table data using `font-mono` with `tabular-nums`.
*   Use semantic colors at 10–15% opacity for badge backgrounds, 100% for text and borders.
*   Give every interactive element the `focus-visible` 2px `accent-primary` outline with offset.
*   Use `surface-hover` on interactive rows and cards; apply `cursor: pointer` only when clickable.
*   Reserve `radius-pill` for badges, tags, and toggles.

### Don't
*   Don't hardcode HEX values in components — tokens only.
*   Don't rely on heavy shadows in dark mode; depth comes from borders and surface steps.
*   Don't use semantic colors (success/danger/warning/info) outside their meaning.
*   Don't invent spacing values outside the 8pt scale.
*   Don't left-align numbers or use proportional figures in tables.
*   Don't give skeleton loaders shapes that don't match the content they replace.

## 7. Agent Prompt Guide

### Quick Color Reference
*   **Accent / Primary CTA**: Indigo `#6366f1` (hover `#4f46e5`)
*   **Page Background**: `#121214` dark / `#f8fafc` light
*   **Card Surface**: `#1e1e24` dark / `#ffffff` light
*   **Primary Text**: `#e4e4e7` dark / `#0f172a` light
*   **Secondary Text**: `#a1a1aa` dark / `#64748b` light
*   **Borders**: `rgba(255,255,255, 0.05)` dark / `#e2e8f0` light
*   **Semantics**: Success `#22c55e` · Danger `#ef4444` · Warning `#f59e0b` · Info `#3b82f6`

### Implementation Directives

1.  **Strict Theme Mapping**: Map tokens to CSS variables (`--bg-base: #121214;`) or Tailwind configs. Never hardcode HEX values in components. Ensure `data-theme` attribute on `<html>` or `<body>` controls the variable output.
2.  **Compose, Don't Reinvent**: Build complex views by stacking a Toolbar over a Data Table, using Status Badges for states.
3.  **Data Alignment**: In tables, always right-align numbers and monetary values. Left-align text. Use `tabular-nums` for all dynamic data.
4.  **Accessibility**: Ensure all interactive elements have the `focus-visible` offset outline ring. Ensure contrast ratios pass in Light Theme for `text-muted`.