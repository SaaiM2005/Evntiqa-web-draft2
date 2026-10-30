# Evntiqa Forms API

FastAPI + PostgreSQL service that stores submissions from the website forms
(`expert_consultation`, `calendar_request`, `case_study_request`).

## Run locally

```bash
cp .env.example .env            # from the repo root; fill in ADMIN_API_KEY and IP_HASH_SALT
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

API: http://localhost:8000 · docs: http://localhost:8000/docs · site: serve the repo root on
`http://localhost:8080` (e.g. `python3 -m http.server 8080`) — the forms post to `localhost:8000`
automatically when the page is opened from localhost.

## Deploy (single VPS)

1. Point an `A` record for `API_DOMAIN` (default `api.evntiqa.com`) at the server.
2. `cp .env.example .env`, set `ENV=prod`, strong `POSTGRES_PASSWORD`, `ADMIN_API_KEY`
   (`openssl rand -hex 32`), `IP_HASH_SALT`, and the real `ALLOWED_ORIGINS`.
3. `docker compose --profile proxy up -d --build`
4. Create the first admin login (prompts for a password):
   `docker compose run --rm api python -m app.cli create-admin you@evntiqa.com`

This starts Postgres, runs migrations, starts the API, Caddy (automatic HTTPS) and a daily
`pg_dump` into `./backups`. Copy `./backups` off the server on a schedule.

If the API lives somewhere other than `https://api.evntiqa.com`, update `API_BASE` in
`index.html`.

## Admin portal

`/admin` (e.g. `https://api.evntiqa.com/admin`) — sign in with email + password.

```bash
uv run python -m app.cli create-admin name@evntiqa.com   # add an admin
uv run python -m app.cli set-password name@evntiqa.com   # reset password (signs them out everywhere)
uv run python -m app.cli deactivate name@evntiqa.com     # revoke access
uv run python -m app.cli list-admins
```

In Docker, prefix with `docker compose run --rm api` and drop `uv run`.
Passwords are Argon2-hashed; sessions are server-side, in an HttpOnly SameSite=Strict cookie
(12 h by default), and login is rate limited.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/v1/submissions` | public, rate limited, honeypot field `website` |
| `POST` | `/api/v1/auth/login`, `/api/v1/auth/logout`; `GET /api/v1/auth/me` | — / session |
| `GET` | `/api/v1/submissions?form_type=&status=&q=&from=&to=&page=&page_size=` | session or `X-API-Key` |
| `GET` | `/api/v1/submissions/stats` | session or `X-API-Key` |
| `GET` | `/api/v1/submissions/export.csv` (same filters) | session or `X-API-Key` |
| `GET` | `/api/v1/submissions/{id}` | session or `X-API-Key` |
| `PATCH` | `/api/v1/submissions/{id}` `{"status": "contacted"}` | session or `X-API-Key` |
| `GET` | `/health/live`, `/health/ready` | — |

```bash
curl -H "X-API-Key: $ADMIN_API_KEY" https://api.evntiqa.com/api/v1/submissions/export.csv -o leads.csv
```

## Develop

```bash
cd backend
uv sync
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evntiqa_test uv run pytest
uv run ruff check . && uv run ruff format . && uv run mypy app
uv run alembic revision --autogenerate -m "describe change"   # new migration
```

## Notes

- Rate limiting is in-memory (per API container). Move slowapi storage to Redis before running
  more than one replica.
- Raw IPs are never stored — only an HMAC of the IP with `IP_HASH_SALT`.
- `/docs` and `/openapi.json` are disabled when `ENV=prod`.
