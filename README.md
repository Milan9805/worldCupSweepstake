# FIFA World Cup 2026 Sweepstake

A serverless web application for managing sweepstake groups during the FIFA 2026 Men's World Cup. Features per-person dashboards, group stage tables, a tournament bracket, and an admin panel.

## Architecture

- **Frontend**: Next.js (static export) with Tailwind CSS
- **Backend**: TypeScript Lambda functions behind API Gateway
- **Database**: DynamoDB
- **Storage**: S3 (avatars)
- **Infrastructure**: Terraform

## Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **Docker** (for DynamoDB Local)

## Local Development Setup

### Quick Start (one command)

```bash
npm run start:local
```

This starts DynamoDB Local, seeds the database, launches the API server, and starts the frontend. Open http://localhost:3000 and enter a group key (e.g., `lads-on-tour`).

### Manual Setup (step by step)

### 1. Install dependencies

```bash
npm install
```

### 2. Start DynamoDB Local

```bash
docker-compose up -d
```

This starts a local DynamoDB instance on port 8000.

### 3. Seed the database

```bash
npx ts-node scripts/seed.ts
```

This creates the DynamoDB tables and seeds them with:
- 2 sweepstake groups with 6 members each
- 48 World Cup teams across 12 groups
- Sample match fixtures with some results

**Test credentials created by the seed script:**

| Item | Value |
|------|-------|
| Group Key 1 | `lads-on-tour` |
| Group Key 2 | `office-sweepstake` |
| Admin Secret | `sweepstake-admin-2026` |

### 4. Start the API server

```bash
npm run api:local
```

The API runs on http://localhost:3001. It connects to DynamoDB Local automatically.

### 5. Start the frontend

In a separate terminal:

```bash
npm run dev
```

The frontend runs on http://localhost:3000 and proxies API calls to localhost:3001.

### 6. Open the app

Navigate to http://localhost:3000 and enter one of the group keys (e.g., `lads-on-tour`).

### 7. Stop everything

```bash
npm run stop
```

This kills the API server, frontend dev server, and stops DynamoDB Local.

## Testing

### Unit & Component Tests

```bash
# Run all tests
npm test

# Run shared package tests (probability calculator)
npm test --workspace=packages/shared

# Run with coverage
npm test -- --coverage
```

### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps

# Run E2E tests (requires both API and frontend running)
npm run test:e2e
```

## Project Structure

```
sweepstake/
├── packages/
│   ├── frontend/          — Next.js app (static export)
│   │   ├── src/app/       — Pages (/, /dashboard, /groups, /bracket, /admin)
│   │   ├── src/components/— UI components
│   │   ├── src/hooks/     — Custom React hooks
│   │   └── src/lib/       — API client
│   ├── api/               — Lambda handlers + Express local server
│   │   ├── src/handlers/  — API endpoint handlers
│   │   ├── src/clients/   — External API clients
│   │   ├── src/services/  — Business logic
│   │   └── src/db/        — DynamoDB access layer
│   └── shared/            — Shared types & utilities
│       └── src/
│           ├── types.ts   — TypeScript interfaces
│           └── probability.ts — Win probability calculator
├── infrastructure/        — Terraform IaC
│   ├── modules/           — Reusable Terraform modules
│   └── environments/      — Per-environment configs
├── scripts/
│   └── seed.ts            — Database seeding script
├── data/
│   └── seed.json          — Seed data (teams, groups, matches)
├── docker-compose.yml     — DynamoDB Local
└── package.json           — npm workspaces root
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/group/:key` | Get group data by key |
| GET | `/api/matches` | Get all matches |
| GET | `/api/teams` | Get all teams with stats |
| GET | `/api/bracket` | Get tournament bracket |
| POST | `/api/refresh` | Refresh data from football-data.org |
| POST | `/api/admin/login` | Admin authentication |
| POST | `/api/admin/members` | Update group members |
| POST | `/api/admin/assign` | Assign teams to people |
| POST | `/api/admin/upload-avatar` | Get presigned upload URL |

## Pages

- **/** — Entry page (group key login)
- **/dashboard** — Per-person team dashboard with stats and leaderboard
- **/groups** — Group stage tables and fixtures
- **/bracket** — Visual tournament bracket (R32 → Final)
- **/admin** — Admin panel (member management, team assignment, avatar upload)

## Deploying to AWS

### Prerequisites

- AWS account with appropriate IAM permissions
- Terraform >= 1.5
- football-data.org API key

### Steps

```bash
# 1. Build the frontend
npm run build --workspace=packages/frontend

# 2. Navigate to the environment
cd infrastructure/environments/dev

# 3. Initialize Terraform
terraform init

# 4. Plan and apply
terraform plan -var="football_data_api_key=YOUR_KEY" -var="jwt_secret=YOUR_SECRET"
terraform apply -var="football_data_api_key=YOUR_KEY" -var="jwt_secret=YOUR_SECRET"

# 5. Upload frontend to S3 (from output bucket name)
aws s3 sync ../../packages/frontend/out s3://BUCKET_NAME

# 6. Seed the production database
TABLE_PREFIX=sweepstake-dev- npx ts-node scripts/seed.ts
```

## Configuration

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | API base URL for frontend | `http://localhost:3001` |
| `IS_LOCAL` | Use local DynamoDB endpoint | `true` |
| `TABLE_PREFIX` | DynamoDB table name prefix | (empty) |
| `JWT_SECRET` | Secret for admin JWT tokens | `dev-secret-change-in-production` |
| `FOOTBALL_DATA_API_KEY` | football-data.org API key | (required for refresh) |
| `PORT` | API server port | `3001` |

## Football Data API Setup

The app fetches live scores and fixtures from [football-data.org](https://www.football-data.org/) (v4 API).

### 1. Register for an API key

Sign up at https://www.football-data.org/client/register. The **free tier** allows 10 requests/minute and includes World Cup data.

### 2. Set the environment variable

Add to your `.env` file:

```bash
FOOTBALL_DATA_API_KEY=your-api-key-here
```

For AWS deployments, pass it as a Terraform variable:

```bash
terraform apply -var="football_data_api_key=YOUR_KEY" -var="jwt_secret=YOUR_SECRET"
```

### 3. How it works

- The `POST /api/refresh` endpoint fetches all matches for the configured competition from football-data.org
- Match scores, statuses, and fixtures are merged into DynamoDB
- Requests are rate-limited to once per 60 seconds to stay within the free tier
- The competition ID is configured in `packages/api/src/clients/footballData.ts` (currently set to `2000` — update when the official World Cup 2026 ID is published)

### 4. What it provides

- Match schedules (dates, times, venues)
- Live scores and final results
- Match status (SCHEDULED / LIVE / FINISHED)
- Group stage and knockout stage classification

### 5. Rate limits

| Plan | Requests/minute |
|------|----------------|
| Free | 10 |
| Standard | 30 |
| Advanced | 60 |

## Key Design Decisions

- **Winner takes all**: The person whose team wins the final wins the sweepstake
- **Manual refresh**: No real-time updates; user-triggered refresh button (rate-limited to 1/min)
- **Static export**: Frontend is pure static HTML/JS served from S3/CloudFront
- **Shared group key**: Simple passphrase per group, no user accounts
- **Admin auth**: Separate bcrypt-hashed secret, independent of group keys
