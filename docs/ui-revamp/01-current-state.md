[< Back to index](./README.md)

## 1. Where we actually stand

### Our CSS reality
| Metric | Value | Comment |
|---|---|---|
| `src/styles/index.css` | **8,030 lines**, 151 KB | Single file, 393 classes |
| Design tokens (`--ui-*`) | 40 defined, **623 usages** | A real token layer exists and is good |
| Hardcoded hex literals | **278** | …bypassing those tokens |
| `rgba()` literals | 116 | mostly shadows |
| Distinct `border-radius` values | **12** (2,3,4,6,8,10,11,12,16,18,20,999px) | should be ~4 |
| Distinct `font-size` px values | **14** (9px→36px) | 9/10/11px text is too small |
| `:root` blocks | 3 (lines 747, 1393, 6929) | tokens defined in three places |
| `box-shadow` declarations | 93 | no elevation scale |
| Dark-mode references | 3 | effectively none |

**The honest read:** a "Civic Editorial" token system was introduced at line 6929 as an *override layer appended to the bottom of the file* rather than a refactor. So we have a good palette **and** 278 hexes that predate it, fighting each other. The revamp is mostly **finishing a migration someone already started**, not inventing a new design language.

### Accessibility gaps (measured)
- `aria-*` attributes: **25 total across the whole app**. `aria-selected` ×2, `aria-controls` ×1.
- `role="tab"` / `role="tablist"` / `role="tabpanel"`: **zero**. Our Overview/Booths/Postal/Analysis switcher is visually tabs but semantically not.
- Heading hierarchy: `h1` → `h3` → `h4`, **no `h2`**. Section titles ("Booth Distribution", constituency names) are `div`s.
- Landmarks: no `<main>`, `<nav>`, `<aside>`, `<footer>` exposed.
- `:focus-visible`: defined for `.interactive-row` only, hardcoded `#2563eb` — a blue that appears nowhere in the Civic Editorial palette.

Walmart front-end standard is **WCAG 2.2 AA**. We are not close.

---

---
