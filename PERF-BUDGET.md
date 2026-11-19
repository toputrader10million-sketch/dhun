# Dhun Performance Budget (Day 47)

Dhun ships a **performance budget** so the free PWA stays fast on cheap Android
devices and patchy networks. The formal gate is a Lighthouse run on the
production build; the in-app Settings → Performance card measures the same
budget live on a real device.

## Budgets (production, mobile-class device)

| Metric | Budget | Rationale |
|---|---|---|
| TTFB | ≤ 800 ms | Vercel edge + static shell |
| FCP | ≤ 2000 ms | First paint of app chrome |
| LCP | ≤ 2500 ms | Greeting/header content |
| JS transferred (first load) | ≤ 500 KB | gzip'd transferSize of script resources |
| Lighthouse (CI gate) | ≥ 90 performance | See "Enforcement" below |

## Enforcement

1. **CI / local** — run Lighthouse on the production URL:
   `npx lighthouse https://dhun-gamma-wheat.vercel.app --preset=perf --form-factor=mobile --throttling-method=simulate`
   Fail the check when performance < 90 or any budget metric above is exceeded.
2. **In-app** — Settings → Performance shows TTFB / FCP / LCP / JS bytes with
   Pass / Near-limit / Over-budget chips against this table (measured live
   after each page load; dev mode can legitimately exceed — CI gates prod).
3. **Code rules that keep the budget green**
   - Views and below-fold dialog chrome are lazy (`next/dynamic` for
     Copilot, shortcuts dialog; views render only when active).
   - Artwork is proxied + sized, never raw upstream URLs.
   - No new heavy dependencies without a bundle-size review.
   - Animations are transform/opacity-only and `prefers-reduced-motion`-aware.
