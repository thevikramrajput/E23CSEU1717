import { Log } from "logging-middleware";
import { Notification, ScoredNotification } from "../types";

const TYPE_WEIGHTS: Record<string, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function calculateScore(notification: Notification, now: number): number {
  const typeWeight = TYPE_WEIGHTS[notification.Type] || 0;
  const timestamp = new Date(notification.Timestamp).getTime();
  const ageMs = now - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1000 - ageHours);
  return typeWeight * 1000 + recencyScore;
}

export function getTopN(notifications: Notification[], n: number): ScoredNotification[] {
  const now = Date.now();
  const heap: ScoredNotification[] = [];

  for (const notif of notifications) {
    const score = calculateScore(notif, now);
    const scored: ScoredNotification = { ...notif, priorityScore: score };

    if (heap.length < n) {
      heap.push(scored);
      siftUp(heap, heap.length - 1);
    } else if (score > heap[0].priorityScore) {
      heap[0] = scored;
      siftDown(heap, 0);
    }
  }

  const result: ScoredNotification[] = [];
  const copy = [...heap];
  while (copy.length > 0) {
    result.push(copy[0]);
    copy[0] = copy[copy.length - 1];
    copy.pop();
    if (copy.length > 0) siftDown(copy, 0);
  }

  return result.sort((a, b) => b.priorityScore - a.priorityScore);
}

function siftUp(heap: ScoredNotification[], idx: number): void {
  while (idx > 0) {
    const parent = Math.floor((idx - 1) / 2);
    if (heap[parent].priorityScore <= heap[idx].priorityScore) break;
    [heap[parent], heap[idx]] = [heap[idx], heap[parent]];
    idx = parent;
  }
}

function siftDown(heap: ScoredNotification[], idx: number): void {
  const len = heap.length;
  while (true) {
    let smallest = idx;
    const left = 2 * idx + 1;
    const right = 2 * idx + 2;

    if (left < len && heap[left].priorityScore < heap[smallest].priorityScore) {
      smallest = left;
    }
    if (right < len && heap[right].priorityScore < heap[smallest].priorityScore) {
      smallest = right;
    }

    if (smallest === idx) break;
    [heap[smallest], heap[idx]] = [heap[idx], heap[smallest]];
    idx = smallest;
  }
}

export async function logPriorityResults(results: ScoredNotification[]): Promise<void> {
  await Log(
    "backend",
    "info",
    "service",
    `Priority inbox computed: top ${results.length} notifications selected`
  );

  for (let i = 0; i < results.length; i++) {
    const n = results[i];
    await Log(
      "backend",
      "debug",
      "service",
      `Priority #${i + 1}: [${n.Type}] "${n.Message}" | score: ${n.priorityScore.toFixed(1)} | time: ${n.Timestamp}`
    );
  }
}
