# Frontend security headers (Nginx)

File: `frontend/nginx.prod.conf` (copied into the production frontend image by `frontend/Dockerfile.prod`).
Login token storage and the portal refresh cookie are described at the end of this page.

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

## Login tokens and the HttpOnly refresh cookie

### Where tokens live

| Who | Token | Lifetime | Where it is kept |
|---|---|---|---|
| Staff (`/app`) | access token only (no refresh token) | `JWT_EXPIRE_MINUTES` (60) | `localStorage` `p7_token` |
| Portal users (`/portal/*`) | access token | `EXTERNAL_JWT_EXPIRE_MINUTES` (45) | `localStorage` `p7_ext_token` |
| Portal users | refresh token | `EXTERNAL_JWT_REFRESH_EXPIRE_DAYS` (14) | flag off: `localStorage` `p7_ext_refresh_token` · flag on: HttpOnly cookie `p7_ext_refresh` |

The refresh token is the valuable one: it lasts 14 days and makes new access tokens. With
`AUTH_REFRESH_COOKIE_ENABLED=true` it lives in a cookie that page JavaScript cannot read, so a
script injected by an XSS bug cannot copy it to another computer.

### How the cookie works (flag on)

- `POST /api/external/auth/login`, `/accept-invite` and `/refresh` send
  `Set-Cookie: p7_ext_refresh=...; HttpOnly; Secure; SameSite=Strict; Path=/api/external/auth; Max-Age=1209600`.
  The cookie is only sent back to the portal auth URLs, never to other API calls.
- Clients that send the header `X-Requested-With: p7` (the current frontend always does) get an
  **empty** `refresh_token` in the JSON body plus `refresh_cookie: true`. The frontend then stores
  only the marker `p7_ext_refresh_mode = "cookie"` and deletes any old `p7_ext_refresh_token`.
- Older frontends still open in a browser (no header) keep getting the token in the body, and
  `/refresh` still accepts `{"refresh_token": "..."}` in the body. Nobody is logged out by the switch.
- `POST /api/external/auth/logout` works with the access token **or** the cookie, revokes every
  token of that portal user on the server (`session_version` bump) and clears the cookie.
- A staff login in the same browser calls portal logout first, because JavaScript cannot delete
  the HttpOnly cookie itself.

### CSRF protection

1. `SameSite=Strict`: the browser never attaches the cookie to a request started by another site.
2. Any request that relies on the cookie (refresh, logout) must carry `X-Requested-With: p7`,
   otherwise the API answers `403`. Browsers only let a page from another origin send that header
   after a CORS preflight, and the preflight passes only for origins listed in `CORS_ORIGINS`.
3. CORS credentials are allowed only for the explicit `CORS_ORIGINS` list. If `CORS_ORIGINS`
   contains `*`, the backend logs a warning and turns credentialed CORS off for everyone.

### Requirements before turning the flag on

- **Same site:** the frontend and the API must be on one site, e.g. `https://prime7erp.com` with
  the API at `https://prime7erp.com/api` (default) or `https://api.prime7erp.com`. A completely
  different domain would need `AUTH_COOKIE_SAMESITE=none`, which weakens CSRF protection; do not do that.
- **HTTPS:** the cookie is `Secure` (`AUTH_COOKIE_SECURE=true`), so it is only sent over HTTPS.
  Browsers also accept it on `http://localhost`, so local Docker works.
- **Host Nginx must pass cookies through:** do not add `proxy_hide_header Set-Cookie`,
  `proxy_ignore_headers Set-Cookie` or `proxy_set_header Cookie ""` on the `/api/` location, and
  do not rewrite the `/api/external/auth` path (the cookie path must match what the browser sees).
  The frontend container's `nginx.prod.conf` already passes both headers unchanged.
- `CORS_ORIGINS` lists the real `https://` origins (already required for production).

### Rollout

1. **Release N (this change): deploy with the flag off.** Behaviour is unchanged; the new frontend
   already sends `X-Requested-With: p7` and `credentials: "include"` on portal auth calls.
2. **Turn it on:** add `AUTH_REFRESH_COOKIE_ENABLED=true` to the server `.env`, then
   `docker compose -f docker-compose.prod.yml up -d backend`. Check in the browser DevTools
   (Application → Cookies) that `p7_ext_refresh` appears after a portal login with HttpOnly,
   Secure and SameSite=Strict, and that `p7_ext_refresh_token` is gone from Local Storage.
   Smoke-test portal login, staying logged in past 45 minutes (refresh), and logout.
3. **Release N+1:** stop returning the refresh token in the body and stop accepting it in
   `/refresh`. Browsers running the current frontend move to the cookie on their next refresh;
   only a tab still running a pre-release-N frontend would need one fresh login.

**Rollback:** set `AUTH_REFRESH_COOKIE_ENABLED=false` (or remove the line) and restart the
backend. Portal users whose refresh token is only in the cookie must log in again once their
45-minute access token expires; nothing else changes. The leftover cookie is ignored and expires.

### Remaining risk (accepted for now)

- Access tokens (staff 60 minutes, portal 45 minutes) stay in `localStorage`. An XSS bug can still
  act as the user while the page is open and can read the current access token. The cookie
  stops it from stealing a 14-day refresh token. The main defence against XSS remains the CSP above.

### Staff login (designed, not built yet)

Staff logins issue only a 60-minute access token today; there is no refresh token to move into
a cookie. The planned follow-up, behind the same flag:

1. `POST /api/v1/auth/login` also issues a refresh JWT (`use=refresh`, `sv` claim, about 12 hours)
   in an HttpOnly cookie `p7_refresh` with `Path=/api/v1/auth`.
2. New `POST /api/v1/auth/refresh` (cookie + `X-Requested-With: p7`) returns a new access token
   and rotates the cookie; it respects single-session (`users.auth_session_version`), so a newer
   login on another device still wins.
3. New `POST /api/v1/auth/logout` bumps `auth_session_version` and clears the cookie.
4. Frontend `api/core.ts`: on `401`, refresh once (shared promise, like the portal client) and retry
   before redirecting to `/login`. After that the access token can move from `localStorage` to memory.
