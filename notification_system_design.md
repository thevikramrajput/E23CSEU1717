# Campus Notifications Microservice

---

# Stage 1

## REST API Design and Contract

### Base URL
```
/api/v1
```

### Authentication
All requests require a valid JWT in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

### 1. Get Notifications (Paginated)

**GET** `/api/v1/notifications`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | integer | 1 | Page number |
| limit | integer | 20 | Items per page (max 100) |
| type | string | - | Filter by type: `Placement`, `Result`, `Event` |
| isRead | boolean | - | Filter by read status |
| sortBy | string | createdAt | Sort field |
| order | string | desc | Sort direction: `asc` or `desc` |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "uuid",
        "type": "Placement",
        "message": "Company X is hiring for SDE roles",
        "isRead": false,
        "createdAt": "2026-05-10T12:00:00Z",
        "studentId": 1042
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 245,
      "totalPages": 13
    }
  }
}
```

---

### 2. Get Single Notification

**GET** `/api/v1/notifications/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "Result",
    "message": "Mid-semester results published",
    "isRead": true,
    "createdAt": "2026-05-09T08:30:00Z",
    "readAt": "2026-05-09T09:00:00Z",
    "studentId": 1042
  }
}
```

**Response (404):**
```json
{
  "success": false,
  "error": "Notification not found"
}
```

---

### 3. Mark Notification as Read

**PATCH** `/api/v1/notifications/:id/read`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "isRead": true,
    "readAt": "2026-05-10T12:05:00Z"
  }
}
```

---

### 4. Mark All Notifications as Read

**PATCH** `/api/v1/notifications/read-all`

**Request Body:**
```json
{
  "studentId": 1042
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "updatedCount": 34
  }
}
```

---

### 5. Delete Notification

**DELETE** `/api/v1/notifications/:id`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Notification deleted"
  }
}
```

---

### 6. Create Notification (Admin)

**POST** `/api/v1/notifications`

**Request Body:**
```json
{
  "type": "Placement",
  "message": "Company Y is hiring for intern roles",
  "studentIds": [1042, 1043, 1044]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "createdCount": 3,
    "notificationGroupId": "uuid"
  }
}
```

---

### 7. Broadcast Notification (Admin - Notify All)

**POST** `/api/v1/notifications/broadcast`

**Request Body:**
```json
{
  "type": "Placement",
  "message": "Company Z campus drive scheduled for next week"
}
```

**Response (202):**
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "queued",
    "message": "Broadcast queued for processing"
  }
}
```

---

### 8. Get Unread Count

**GET** `/api/v1/notifications/unread-count`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "unreadCount": 12
  }
}
```

---

### Real-Time Notification Mechanism

WebSocket connection for real-time push:

**Connection:**
```
ws://host/ws/notifications?token=<jwt_token>
```

**Server pushes messages in this format:**
```json
{
  "event": "new_notification",
  "data": {
    "id": "uuid",
    "type": "Placement",
    "message": "Company X interview shortlist released",
    "createdAt": "2026-05-10T14:00:00Z"
  }
}
```

**Supported events:**
| Event | Description |
|-------|-------------|
| `new_notification` | A new notification arrives |
| `notification_read` | A notification was marked as read |
| `unread_count_update` | Unread count changed |

The client maintains a persistent WebSocket connection after login. On the server side, each connected student is tracked in a connection map. When a new notification is created, the server looks up the target student's active connections and pushes the event directly. If the student is offline, the notification is simply stored in the database and delivered on next fetch.

---

# Stage 2

## Database Design

### Choice: PostgreSQL

PostgreSQL is the right fit here because:

- Notification data is inherently relational - students have notifications, notifications have types, read statuses, timestamps
- We need strong consistency for read/unread state tracking
- PostgreSQL handles complex queries with filtering, sorting, and pagination efficiently
- Built-in support for indexing strategies that we will need as data grows
- JSONB support gives flexibility if notification metadata evolves later
- Mature ecosystem for connection pooling, replication, and backups

---

### Schema

```sql
CREATE TABLE students (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(150) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        INTEGER NOT NULL REFERENCES students(id),
    notification_type notification_type NOT NULL,
    message           TEXT NOT NULL,
    is_read           BOOLEAN DEFAULT FALSE,
    read_at           TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### Indexes

```sql
CREATE INDEX idx_notifications_student_unread
    ON notifications(student_id, is_read, created_at DESC)
    WHERE is_read = FALSE;

CREATE INDEX idx_notifications_student_created
    ON notifications(student_id, created_at DESC);

CREATE INDEX idx_notifications_type_created
    ON notifications(notification_type, created_at DESC);
```

The partial index on `is_read = FALSE` is particularly important because the majority of queries will be fetching unread notifications. This keeps the index small and fast since read notifications get excluded from it.

---

### Scalability Concerns

1. **Table bloat** - With 50,000 students each getting dozens of notifications daily, the table grows fast. After a year, we could have hundreds of millions of rows.

2. **Write contention** - Broadcast notifications generate massive insert bursts (50k rows at once). This can cause lock contention and WAL pressure.

3. **Index maintenance overhead** - Every insert and update triggers index updates. With multiple indexes, write performance degrades as data grows.

4. **Query performance on unread scans** - Even with indexes, scanning through millions of rows for a single student's unread notifications can slow down as historical data accumulates.

---

### How to Solve These Problems

1. **Table partitioning** - Partition the notifications table by `created_at` using range partitioning (monthly). Old partitions can be archived or dropped. Queries naturally hit only recent partitions.

```sql
CREATE TABLE notifications (
    id                UUID DEFAULT gen_random_uuid(),
    student_id        INTEGER NOT NULL,
    notification_type notification_type NOT NULL,
    message           TEXT NOT NULL,
    is_read           BOOLEAN DEFAULT FALSE,
    read_at           TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

CREATE TABLE notifications_2026_05 PARTITION OF notifications
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

2. **Archival strategy** - Move notifications older than 6 months to a separate archive table. Active queries only hit the main table.

3. **Batch inserts** - For broadcasts, use bulk INSERT with `unnest` instead of individual inserts:
```sql
INSERT INTO notifications (student_id, notification_type, message)
SELECT unnest($1::int[]), $2, $3;
```

4. **Connection pooling** - Use PgBouncer to handle connection overhead from concurrent student requests.

---

### Query Examples

**Fetch unread notifications for a student (paginated):**
```sql
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

**Mark a notification as read:**
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE id = $1 AND student_id = $2;
```

**Mark all as read for a student:**
```sql
UPDATE notifications
SET is_read = TRUE, read_at = NOW()
WHERE student_id = $1 AND is_read = FALSE;
```

**Get unread count:**
```sql
SELECT COUNT(*) AS unread_count
FROM notifications
WHERE student_id = $1 AND is_read = FALSE;
```

**Delete a notification:**
```sql
DELETE FROM notifications
WHERE id = $1 AND student_id = $2;
```

---

# Stage 3

## Analyzing the Slow Query

The original query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Is this query accurate?

The query itself is logically correct for fetching unread notifications of a specific student, ordered by newest first. However, there are practical issues:

- `SELECT *` fetches all columns including potentially large text fields that are not needed for a listing view. This wastes I/O and memory.
- There is no `LIMIT` clause, so if a student has thousands of unread notifications, all of them are returned at once. This is both slow and wasteful.
- Column naming (`studentID`, `isRead`, `createdAt`) uses camelCase which is not standard PostgreSQL convention, but this is cosmetic.

### Why is this slow?

With 5,000,000 notifications in the table:

1. **No composite index** - Without an index on `(studentID, isRead, createdAt)`, PostgreSQL performs a sequential scan on the entire 5M row table. Even with single-column indexes, the planner may choose a sequential scan if it estimates the selectivity poorly.

2. **Sorting without index support** - The `ORDER BY createdAt DESC` requires a sort operation. Without an index that already stores rows in this order, PostgreSQL materializes matching rows in memory (or on disk via temp files) and sorts them. For large result sets, this is expensive.

3. **`SELECT *` overhead** - Reading every column from each matching row causes more disk pages to be loaded. If the table has wide rows (long message text), this amplifies I/O.

4. **No pagination** - Returning all matching rows at once means PostgreSQL cannot bail out early.

### What would I change?

1. Create a composite partial index:
```sql
CREATE INDEX idx_student_unread_recent
    ON notifications(student_id, created_at DESC)
    WHERE is_read = FALSE;
```

This index covers the exact access pattern: filter by student + unread status, already sorted by recency. The partial condition (`WHERE is_read = FALSE`) keeps the index small because read notifications (likely the majority) are excluded.

2. Rewrite the query:
```sql
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = FALSE
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;
```

**Computation cost after changes:**

- Without index: O(n) sequential scan on 5M rows, plus O(k log k) sort where k is matching rows
- With the composite partial index: O(log n) index lookup + O(limit) index scan. For LIMIT 20, this is essentially constant time regardless of table size
- The partial index only contains unread rows, so it is significantly smaller than a full index. If 90% of notifications are read, the index is 10x smaller

### Is indexing every column effective?

No. Adding indexes on every column is a bad idea for several reasons:

1. **Write amplification** - Every INSERT, UPDATE, or DELETE must update every index. With 50,000 students receiving frequent notifications, write throughput drops significantly. Each broadcast of 50k notifications would need to update all indexes.

2. **Storage overhead** - Each index consumes disk space. With many columns and 5M+ rows, the combined index storage can exceed the actual table size.

3. **Planner confusion** - Too many indexes can cause the query planner to make suboptimal choices. It may pick a less efficient index or waste time evaluating index options.

4. **Maintenance cost** - More indexes means longer VACUUM and REINDEX operations, more WAL generation, and slower replication.

The right approach is to create indexes based on actual query patterns. Typically 2-4 well-designed composite indexes cover 95% of access patterns.

### Query: Students who received a placement notification in the last 7 days

```sql
SELECT DISTINCT s.id, s.name, s.email
FROM students s
INNER JOIN notifications n ON s.id = n.student_id
WHERE n.notification_type = 'Placement'
  AND n.created_at >= NOW() - INTERVAL '7 days';
```

With the type-based index suggested earlier (`idx_notifications_type_created`), this query can efficiently scan only Placement notifications from the last 7 days.

---
