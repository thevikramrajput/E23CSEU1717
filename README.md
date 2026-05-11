# Campus Hiring Evaluation

Backend track submission.

## Structure

```
logging_middleware/           - reusable logging package
vehicle_maintenance_scheduler/ - scheduling microservice
notification_app_be/          - priority inbox (stage 6)
notification_system_design.md - system design (stages 1-6)
```

## Getting Started

### 1. Logging Middleware

```bash
cd logging_middleware
npm install
npm run build
```

### 2. Vehicle Maintenance Scheduler

```bash
cd vehicle_maintenance_scheduler
cp .env.example .env   # fill in your credentials
npm install
npm run dev
```

Runs on `http://localhost:3000`

### 3. Priority Inbox

```bash
cd notification_app_be
cp .env.example .env   # fill in your credentials
npm install
npx ts-node src/index.ts
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | health check |
| GET | /api/v1/depots | list depots |
| GET | /api/v1/vehicles | list vehicle tasks |
| GET | /api/v1/schedule/:depotId | optimized schedule for a depot |
| GET | /api/v1/schedule | schedules for all depots |

## Tech

- TypeScript, Express, Node.js 18+
- 0/1 Knapsack DP for task optimization
- Min-heap for priority inbox
- Token caching with expiry-based refresh
