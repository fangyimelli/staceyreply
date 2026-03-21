# Deployment notes

## Static data path contract

Official replay data is always published from `public/preprocessed/` in the repository and is fetched in the browser from `/preprocessed/...`.

- Repo source directory: `public/preprocessed/`
- Runtime URL prefix: `/preprocessed/`
- Build output location: `dist/preprocessed/`

Do not publish official replay datasets to any alternate runtime path.

## SPA fallback rule

`/preprocessed/**` **must bypass SPA fallback**.

If your hosting platform supports rewrites, redirects, or SPA fallback rules, make sure the `/preprocessed/**` rule is evaluated **before** the catch-all rewrite to `index.html`.

Reason: the app expects JSON at `/preprocessed/manifest.json`, `/preprocessed/<pair>/index.json`, and `/preprocessed/<pair>/events/<eventId>.json`. If the host rewrites those requests to `index.html`, the client receives HTML instead of JSON and replay loading fails.

Preprocessing also guarantees that each official pair (`eurusd`, `usdcad`, `gbpusd`, `audusd`) emits `public/preprocessed/<pair>/index.json` on disk on every successful run. Even when a pair has `candidateCount = 0`, the script still writes a valid empty index so any advertised manifest `indexPath` always resolves to a real JSON file.

## Required hosting behavior

1. Serve `dist/preprocessed/**` as normal static files.
2. Exclude `/preprocessed/**` from SPA fallback.
3. Apply the SPA fallback only after the `/preprocessed/**` static-file rule.

## Example patterns

### Generic rule order

1. `/preprocessed/**` -> static file handling
2. `/**` -> `/index.html` SPA fallback

### Vercel-style example

```json
{
  "rewrites": [
    {
      "source": "/preprocessed/:path*",
      "destination": "/preprocessed/:path*"
    },
    {
      "source": "/:path((?!preprocessed/).*)",
      "destination": "/index.html"
    }
  ]
}
```

### Netlify-style example

```toml
[[redirects]]
from = "/preprocessed/*"
to = "/preprocessed/:splat"
status = 200
force = false

[[redirects]]
from = "/*"
to = "/index.html"
status = 200
```

## Local dev / preview behavior

`vite.config.ts` explicitly mounts `/preprocessed` to the repository's `public/preprocessed/` directory during both `vite dev` and `vite preview`, so local replay JSON requests do not depend on SPA fallback behavior either.
