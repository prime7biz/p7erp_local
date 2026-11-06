# Frontend security headers (Nginx)

File: `frontend/nginx.prod.conf` (copied into the production frontend image by `frontend/Dockerfile.prod`).

## What is sent

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Browser must trust our `Content-Type`; stops "guess it is a script" attacks. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Other sites only see `https://prime7erp.com`, never full ERP URLs with record ids. |
| `X-Frame-Options` | `SAMEORIGIN` | Other sites cannot put the ERP in an `<iframe>` (click-jacking). |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb disabled | The ERP does not use them. |
| `Content-Security-Policy-Report-Only` | see `$p7_csp` in the config | Lists where scripts, styles, fonts, images and API calls may come from. |

All headers use `always` so they are also sent on 404/500 responses.

## CSP is in report-only mode

Report-only means the browser **only logs** violations (DevTools → Console, lines starting with
`[Report Only]`) and **blocks nothing**. This is deliberate: a wrong CSP breaks the whole app.

### How to switch to enforcing

1. Deploy as is. Use the app normally for a few days (login, dashboard map, vouchers, prints,
   PDF/Excel exports, AI drawer, customer and financier portals).
2. Check the browser console for `Content-Security-Policy` report-only messages. For each one,
   either fix the code or add the origin to the matching directive in `$p7_csp`.
3. In `frontend/nginx.prod.conf` rename `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` in **all three** places (server block, `location ^~ /assets/`,
   `location = /index.html`). Nginx ignores server-level `add_header` inside a location that has
   its own `add_header`, which is why the lines are repeated.
4. Validate: `docker run --rm -v "<path>\frontend\nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine nginx -t`
5. Rebuild/redeploy the frontend image. Rollback = rename the header back (or deploy the previous image tag).

### Things the policy already allows

- Scripts: only our own files. The pre-React theme script is the file `frontend/public/theme-init.js`
  (no inline script, so no hash to maintain).
- Styles: our CSS plus inline styles (`'unsafe-inline'`) — React `style={...}`, toast styles and
  print popups need it.
- Fonts: self-hosted Inter from `@fontsource-variable/inter` (no Google Fonts).
- API calls: same origin, `https://prime7erp.com`, `https://www.prime7erp.com`,
  `https://api.prime7erp.com`, and `https://cdn.jsdelivr.net` (dashboard world map data).
  **If `VITE_API_BASE_URL` points to another host, add it to `connect-src`.**
- Images: own, `data:`, `blob:` and any `https:` image (tenant logos may be external URLs).

### If you add something new

- A third-party script (analytics, chat widget): add its origin to `script-src` and
  `connect-src`, or it will be blocked once enforcing.
- An iframe embed (YouTube, maps): add its origin to `frame-src`.
