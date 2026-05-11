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

# Stage 4

## Scaling Notification Fetching

The core problem: every page load triggers a database query per student. With 50,000 students, the DB gets overwhelmed during peak hours.

### Solution 1: Redis Caching Layer

Cache each student's recent unread notifications in Redis.

**How it works:**
- On first fetch, query the DB and store the result in Redis with a key like `notifications:unread:{studentId}`
- Set a TTL of 60-120 seconds
- Subsequent page loads within the TTL hit Redis instead of PostgreSQL
- When a new notification is created, invalidate the affected student's cache key

**Tradeoffs:**
- Pros: Dramatically reduces DB load. Redis handles hundreds of thousands of reads per second. Sub-millisecond response times.
- Cons: Introduces cache staleness - a student might not see a new notification for up to TTL seconds. Adds infrastructure complexity (Redis cluster, memory management). Cache invalidation on broadcast is expensive (50k keys to invalidate).

### Solution 2: Cursor-Based Pagination

Replace offset-based pagination with cursor-based pagination using the last seen `created_at` timestamp.

```sql
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = FALSE AND created_at < $2
ORDER BY created_at DESC
LIMIT 20;
```

**Tradeoffs:**
- Pros: Consistent performance regardless of page depth. No "skipping rows" problem that offset pagination has.
- Cons: Cannot jump to arbitrary pages. Slightly more complex client implementation.

### Solution 3: WebSocket for Real-Time Updates

Instead of polling on every page load, maintain a WebSocket connection. The server pushes new notifications as they arrive.

**Tradeoffs:**
- Pros: Eliminates polling entirely for active users. Instant delivery. No wasted DB queries.
- Cons: Memory overhead for maintaining thousands of persistent connections. Requires sticky sessions or a pub/sub layer (Redis Pub/Sub) for multi-server deployments. Disconnection handling adds complexity.

### Solution 4: HTTP Conditional Requests

Use `ETag` or `Last-Modified` headers. The client sends `If-None-Match` on subsequent requests. If nothing changed, the server returns `304 Not Modified` without querying the DB.

**Tradeoffs:**
- Pros: Simple to implement. No additional infrastructure.
- Cons: Still requires the server to check if data changed (though this can be a cheap COUNT query or a cached version hash). Not truly real-time.

### Recommended Strategy

Combine solutions 1 and 3:

- Active/online students use WebSocket connections for real-time push
- Redis caching handles the initial page load and serves as fallback
- Cursor-based pagination for historical browsing
- Unread count is cached separately with short TTL and invalidated on writes

This hybrid approach handles both real-time delivery and burst traffic without overwhelming the database.

---

# Stage 5

## Analyzing the Broadcast Implementation

The current pseudocode:
```python
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)
        save_to_db(student_id, message)
        push_to_app(student_id, message)
```

### Shortcomings

1. **Synchronous and sequential** - Processing 50,000 students one by one means the HR waits for all 50,000 emails, DB inserts, and app pushes to complete before getting a response. If each iteration takes 100ms, that is 5,000 seconds (~83 minutes).

2. **No error isolation** - If `send_email` fails for student 201, the entire loop may crash. Students 202-50,000 never get notified. DB saves and app pushes for student 201 are also skipped.

3. **Tightly coupled operations** - Email sending, DB persistence, and app push are fundamentally different operations with different failure modes and latency profiles. Coupling them in a single loop means the slowest operation (email) blocks everything.

4. **No retry mechanism** - Transient failures (SMTP timeout, temporary DB connection issue) cause permanent notification loss.

5. **No idempotency** - If the process crashes after 10,000 students, restarting it from the beginning sends duplicate notifications to the first 10,000.

6. **Single point of failure** - One server handles everything. If it goes down mid-process, partial state is lost.

### Handling the 200 failed emails

Immediate steps:
1. The 200 failed student IDs should already be captured in a dead letter queue or failure log
2. Identify the failure reason (SMTP rate limit, invalid email, timeout)
3. Retry the failed batch with exponential backoff
4. If retries fail, flag those students for manual review
5. Ensure the DB save and in-app push for those 200 students are verified independently (they should not have been blocked by email failure)

### Redesigned Architecture

```
HR clicks "Notify All"
        |
        v
  API Server
  (accepts request, returns jobId immediately)
        |
        v
  Message Queue (RabbitMQ / Redis Streams)
  - Creates one message per student
  - Or batches of 100 students per message
        |
        +---> DB Worker Pool (2-3 workers)
        |     - Bulk INSERT notifications
        |     - Batches of 500-1000 rows
        |     - Acknowledges messages on success
        |
        +---> Email Worker Pool (5-10 workers)
        |     - Sends emails with rate limiting
        |     - Retries up to 3 times with backoff
        |     - Failed messages go to Dead Letter Queue
        |
        +---> Push Worker Pool (2-3 workers)
              - Sends WebSocket/push notifications
              - Best-effort delivery (no retry needed)
```

### Revised Pseudocode

```python
function notify_all(student_ids: array, message: string) -> job_id:
    job_id = create_job_record(status="queued", total=len(student_ids))

    for batch in chunk(student_ids, 100):
        enqueue("notification.batch", {
            job_id: job_id,
            student_ids: batch,
            message: message
        })

    return job_id


function db_worker(batch_message):
    try:
        bulk_insert_notifications(batch_message.student_ids, batch_message.message)
        acknowledge(batch_message)
    except:
        retry_with_backoff(batch_message, max_retries=3)


function email_worker(batch_message):
    for student_id in batch_message.student_ids:
        try:
            send_email(student_id, batch_message.message)
        except:
            enqueue("email.retry", {
                student_id: student_id,
                message: batch_message.message,
                attempt: 1
            })


function email_retry_worker(retry_message):
    if retry_message.attempt > 3:
        move_to_dead_letter_queue(retry_message)
        return
    try:
        send_email(retry_message.student_id, retry_message.message)
    except:
        retry_message.attempt += 1
        enqueue_with_delay("email.retry", retry_message, delay=2^retry_message.attempt)


function push_worker(batch_message):
    for student_id in batch_message.student_ids:
        push_to_connected_client(student_id, batch_message.message)
```

### Should DB save and email happen together?

No, they should not. Reasons:

1. **Different failure modes** - Database operations fail due to connection issues or constraint violations. Emails fail due to SMTP limits, invalid addresses, or provider outages. Coupling them means an email failure prevents a perfectly valid DB write.

2. **Different latency** - DB inserts are fast (1-5ms). Email sending is slow (50-500ms per email). Blocking DB writes on email delivery wastes time.

3. **Different consistency requirements** - The notification must be persisted in the DB reliably (this is the source of truth). Email is a delivery channel that can be retried. Losing a DB record is unacceptable; a delayed email retry is acceptable.

4. **Atomicity is not needed** - A student can receive the in-app notification even if the email fails. The in-app notification (from DB) is the primary channel. Email is supplementary.

The correct approach is to save to DB first (guaranteed persistence), then fire email and push as separate async operations that can fail and retry independently.

---

# Stage 6

## Priority Inbox Implementation

### Approach

The priority inbox needs to efficiently maintain the top `n` most important unread notifications based on two factors:

1. **Type weight**: Placement (3) > Result (2) > Event (1)
2. **Recency**: More recent notifications score higher

### Scoring Formula

```
score = (typeWeight * 1000) + recencyScore
```

Where `recencyScore = max(0, 1000 - ageInHours)`. The type weight is multiplied by 1000 to ensure it always dominates over recency within the same weight class, while still allowing a very recent Event to potentially rank near an older Result.

### Data Structure: Min-Heap

A min-heap of size `n` is used to efficiently track the top-n notifications:

1. Iterate through all notifications
2. For each notification, calculate its priority score
3. If the heap has fewer than `n` elements, insert directly
4. If the score is greater than the heap's minimum (root), replace the root and sift down
5. After processing all notifications, extract from the heap in sorted order

**Time complexity:** O(m log n) where m is total notifications and n is the desired top count. This is better than sorting all notifications (O(m log m)) when n is much smaller than m.

### How New Notifications Maintain Top-N Efficiently

When a new notification arrives in real-time:

1. Calculate its priority score
2. Compare with the current minimum in the heap (the root of the min-heap)
3. If the new score is higher than the minimum, replace the root and sift down - O(log n)
4. If the new score is lower, discard it - O(1)

This means each incoming notification requires at most O(log n) work to maintain the priority inbox, making it suitable for real-time streaming scenarios without reprocessing the entire dataset.

### Running the Implementation

```bash
cd notification_app_be
npm install
npx ts-node src/index.ts
```

The output displays a formatted table showing the top 10 notifications ranked by priority score, along with their type, message, timestamp, and computed score.
