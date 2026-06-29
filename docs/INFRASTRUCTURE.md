# Infrastructure

This document is the project-local source of truth for Cloudflare, Coolify, and shared Supabase expectations. Keep it current whenever domains, DNS records, Cloudflare Workers/Pages/R2, Coolify resources, health checks, environment variables, Supabase schemas, storage buckets, Edge Functions, or auth redirects change.

## Snapshot

| Field | Value |
| --- | --- |
| Path | /Users/jeremysmith/Sandbox/documentation-governor |
| Git remote | https://github.com/solovision24/documentation-governor.git |
| Source branch used during generation | main |
| Package | documentation-governor |
| Primary placement | no-live-mapping-found |
| Supabase posture | not-detected |
| Confidence | limited: no live Cloudflare/Coolify/Supabase mapping found in current inventory |
| Generated | 2026-06-29T19:47:49.765Z |

Evidence sources from the central infrastructure workspace:

- `outputs/domain-standards-audit.json`
- `outputs/deep-live-domain-audit.json`
- `outputs/current-domain-setup-report.json`
- `outputs/coolify-app-inventory.json`
- `outputs/cloudflare-all-domain-status.json`

## Operating Model

- Cloudflare is the public DNS and edge front door for owned production domains wherever possible.
- Coolify remains the runtime for Docker, SSR, APIs, webhooks, jobs, private secrets, persistent volumes, long-running services, and anything that has not been proven safe as static edge hosting.
- Cloudflare static hosting is allowed only for proven static shells with explicit API hosts, safe cache behavior, preview verification, and rollback.
- R2 is preferred for release artifacts, generated exports, large public assets, private upload objects served by signed URLs, and off-server backup copies.
- Cloudflare Access belongs on private human-facing surfaces only. Do not put Access in front of public APIs, OAuth/Auth callbacks, mobile bootstrap endpoints, webhooks, or shared Supabase traffic unless bypass/service-token behavior is deliberately designed and tested.
- Shared Supabase lives at `https://sb.solovisionllc.com`. Apps on the shared instance must use app capsules: app schema, registry entry, app-prefixed buckets/functions, RLS, and `shared.app_memberships` or an equivalent app-aware authorization model.

## Repository Signals

| Signal | Value |
| --- | --- |
| Framework hints | not detected |
| Relevant scripts | not detected |

Tracked infrastructure files found in this repo:

- `package.json`

Live hostnames from Coolify/current infrastructure inventory:

- No live hostnames found in current Coolify/domain inventory.

Additional owned-domain hostnames found in repo text:

- No additional owned hostnames detected in repo text.

Detected Supabase-related environment variable names:

- No Supabase environment variable names detected.

Detected Cloudflare/R2-related environment variable names:

- No Cloudflare/R2 environment variable names detected.

## Cloudflare And DNS

| Domain | Scope | Authority | Setup | Placement | Apex HTTP | WWW HTTP |
| --- | --- | --- | --- | --- | --- | --- |
| None found |  |  |  |  |  |  |

Standards audit:

| Domain | Recommended Model | Status | Failures | Advisories |
| --- | --- | --- | --- | --- |
| None found |  |  |  |  |

Maintenance expectations:

- Preserve Cloudflare authoritative nameservers for owned domains.
- Preserve mail, TXT verification, DMARC, and provider-verification records when changing DNS.
- Keep apex and `www` proxied through Cloudflare for public web surfaces unless a documented exception says DNS-only is intentional.
- Keep native/API hosts DNS-only only when documented as a temporary proof path; promote to proxied only after mobile/API/SSE/auth flows are verified through Cloudflare.
- Any new hostname used by code, mobile clients, OAuth, webhooks, uploads, downloads, or admin tools must be added to the host-role matrix before the project is considered complete.

## Coolify

| Name | UUID | Status | Repo | Branch | Hostnames | Build Pack | Health Check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| None found |  |  |  |  |  |  |  |

Critical route audit rows:

| Host | Path | Role | Severity | Public | Origin | Problem |
| --- | --- | --- | --- | --- | --- | --- |
| None found |  |  |  |  |  |  |

Current route findings:

- Failing required routes in this repo snapshot: none detected
- Advisory routes in this repo snapshot: none detected

Maintenance expectations:

- Do not call a Coolify-backed app complete until deployment is finished, app status is acceptable, and live health plus one user-critical route pass.
- If a route returns `503 no available server` through Cloudflare and direct origin, treat it as a Coolify/origin runtime issue, not a DNS issue.
- Health checks should hit a cheap app-owned endpoint such as `/health`, `/healthz`, or `/api/health`, not an expensive page or model-loading path.
- For powered-down apps, document `offline_by_choice` explicitly instead of deleting hostnames from the map.
- Before changing Coolify settings, fetch the current resource, patch only intended fields, and keep rollback/deploy evidence.

## Supabase

| Field | Value |
| --- | --- |
| Shared API URL | https://sb.solovisionllc.com |
| Shared-env local source | /Users/jeremysmith/.config/solovision/supabase/shared.env (secret; never commit or print values) |
| Posture | not-detected: no shared Supabase URL, registry, or Supabase env names detected by this pass |
| Uses shared URL in repo | not detected |
| Registry | not detected |
| App IDs | not detected |
| Schemas | not detected |
| Buckets | not detected |

Maintenance expectations:

- Use `https://sb.solovisionllc.com` as the public Supabase API URL unless this repo has explicitly graduated to a dedicated stack.
- Do not commit anon keys, service-role keys, JWT secrets, direct database URLs, OAuth secrets, SMTP secrets, provider tokens, or local shared env values.
- Keep service-role keys, direct database URLs, JWT secrets, and backend-only secrets out of `VITE_*`, `NEXT_PUBLIC_*`, and browser bundles.
- New app data belongs in an app schema, not `public`.
- Every app schema/table/bucket/function/secret change must update `infrastructure/supabase/registry.yml` and app docs when those files exist.
- Auth redirects use shared Supabase Auth. The platform callback is `https://sb.solovisionllc.com/auth/v1/callback`; each app must pass its own `redirect_to` and that callback must be allow-listed in shared Auth config.

## Change Checklist

Before merging or deploying infrastructure-affecting changes:

1. Confirm hostnames and required routes in this file still match code, mobile config, Coolify, and Cloudflare.
2. Rerun the relevant Cloudflare/Coolify/Supabase audit or document why live verification was not possible.
3. Verify public health and one user-critical route after deployment.
4. Update this document with any new domains, API hosts, buckets, functions, auth callbacks, or intentional powered-down resources.
5. Keep secrets redacted in logs, docs, screenshots, and final reports.
