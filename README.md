# Evntiqa Website

Marketing website for Evntiqa, plus a small backend that stores form responses and an admin
portal to view them.

| Part | What it is | Where |
|---|---|---|
| Website | Static HTML/CSS/JS pages (`index.html`, `about.html`, `careers.html`) | repo root |
| Backend API | FastAPI + PostgreSQL. Stores submissions from the homepage forms | `backend/` |
| Admin portal | Email + password login to view, search, update and export responses | served by the API at `/admin` |

The homepage has three forms, all saved by the API:

- **Expert consultation**: the inline "Schedule Expert Consultation" form
- **Calendar request**: the "Get the 2027 CISO Roundtable Calendar" popup
- **Case study request**: the "Read the Case Study" popup (stores which case study)

```
.
├── index.html, about.html, careers.html, *.js   # website
├── backend/                                     # API, admin portal, tests (see backend/README.md)
├── deploy/                                      # Caddyfile (HTTPS proxy), backup script
├── docker-compose.yml                           # production stack
├── docker-compose.dev.yml                       # local overrides (hot reload, open ports)
└── .env.example                                 # settings template
```

---

## Run locally (without Docker)

You need [Homebrew](https://brew.sh), Python 3.12+, PostgreSQL 16, and [uv](https://docs.astral.sh/uv/).

### 1. One-time setup

```bash
brew install postgresql@16 uv
brew services start postgresql@16
createdb evntiqa

cd backend
uv sync                                   # installs Python dependencies into backend/.venv
```

Create `backend/.env` (it's git-ignored, so never commit it):

```bash
cat > .env <<EOF
ENV=dev
DATABASE_URL=postgresql://$(whoami)@localhost:5432/evntiqa
IP_HASH_SALT=$(openssl rand -hex 16)
ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:5500,http://localhost:5500
EOF
```

Create the database tables and your admin login:

```bash
uv run alembic upgrade head
uv run python -m app.cli create-admin you@evntiqa.com    # asks for a password (min 10 chars)
```

### 2. Start everything (two terminals)

```bash
# Terminal 1: API + admin portal on http://localhost:8000
cd backend
uv run uvicorn app.main:app --reload
```

```bash
# Terminal 2: website on http://localhost:8080 (run from the repo root)
python3 -m http.server 8080
```

### 3. Try it

1. Open **http://localhost:8080/index.html** and submit any of the three forms.
2. Open **http://localhost:8000/admin** and sign in with the email and password you created.
3. Your submission appears in the list. Click it to see details, change its status, or reply.

> Open the site through a local server (step 2 above or VS Code Live Server). Don't
> double-click `index.html`: pages opened as `file://` can't call the API.

---

## Run locally with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env
# In .env set: ENV=dev, a POSTGRES_PASSWORD, IP_HASH_SALT (openssl rand -hex 16),
# and ALLOWED_ORIGINS=http://localhost:8080

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

This starts Postgres, runs the migrations, and serves the API on http://localhost:8000.
Create an admin login in a second terminal:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm api \
  python -m app.cli create-admin you@evntiqa.com
```

Then serve the website with `python3 -m http.server 8080` and follow **Try it** above.

---

## Admin portal

URL: `http://localhost:8000/admin` locally, `https://api.evntiqa.com/admin` in production.

- Summary counts per form, and how many responses are still **not contacted**
- Filter by form and status; search by name, email or company
- Click a row to see the message, case study, source page and UTM tags
- Mark a response **New / Contacted / Archived**, or reply by email
- **Export CSV** downloads whatever the current filters show

Manage admin accounts from `backend/` (in Docker, use `docker compose run --rm api python -m app.cli …`):

```bash
uv run python -m app.cli create-admin name@evntiqa.com   # add an admin
uv run python -m app.cli set-password name@evntiqa.com   # reset a password (signs them out)
uv run python -m app.cli deactivate name@evntiqa.com     # remove access
uv run python -m app.cli list-admins
```

---

## Run the tests

Tests use their own database, `evntiqa_test`, which is wiped on every run. Never point them at
real data.

```bash
createdb evntiqa_test                    # once
cd backend
DATABASE_URL=postgresql://$(whoami)@localhost:5432/evntiqa_test uv run pytest
uv run ruff check . && uv run mypy app   # lint + type check
```

GitHub Actions runs the same checks and a Docker build on every push that touches `backend/`.

---

## Deploy to production

On a Linux server with Docker, and a DNS `A` record for `api.evntiqa.com` pointing at it:

```bash
git clone <repo-url> evntiqa && cd evntiqa
cp .env.example .env
# Edit .env: ENV=prod, strong POSTGRES_PASSWORD, IP_HASH_SALT,
# ALLOWED_ORIGINS=https://evntiqa.com,https://www.evntiqa.com, API_DOMAIN=api.evntiqa.com

docker compose --profile proxy up -d --build
docker compose run --rm api python -m app.cli create-admin you@evntiqa.com
```

This runs Postgres, the API, Caddy (automatic HTTPS) and a daily database backup into
`./backups`. Copy that folder off the server regularly.

The website itself is static: host the HTML files anywhere (Netlify, Vercel, S3, the same
server). The forms post to `https://api.evntiqa.com`. If the API lives somewhere else,
change `API_BASE` near the top of the main `<script>` in `index.html`.

To update after a `git pull`: `docker compose --profile proxy up -d --build` (migrations run
automatically).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Form shows "Something went wrong…" | The API isn't running, or the site's address isn't in `ALLOWED_ORIGINS`. Add it (e.g. `http://localhost:5500`) and restart the API. |
| Form shows "Too many requests" | Rate limit is 5 submissions/minute per visitor. Wait a minute. |
| Admin login says "Too many attempts" | Login is limited to 5 tries/minute. Wait a minute. |
| Forgot admin password | `uv run python -m app.cli set-password you@evntiqa.com` |
| `connection refused` on port 5432 | Postgres isn't running: `brew services start postgresql@16` |
| `relation "form_submissions" does not exist` | Run `uv run alembic upgrade head` in `backend/` |
| `Address already in use` | Something is already on port 8000/8080. Stop it or pick another port. |

More backend details (API endpoints, settings, adding migrations): [backend/README.md](backend/README.md).
