import { Log } from "logging-middleware";
import { Vehicle, ScheduleResult } from "../types";

function solveKnapsack(
  vehicles: Vehicle[],
  capacity: number
): { maxImpact: number; selected: Vehicle[] } {
  const n = vehicles.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(capacity + 1).fill(0)
  );

  for (let i = 1; i <= n; i++) {
    const task = vehicles[i - 1];
    for (let w = 0; w <= capacity; w++) {
      if (task.Duration <= w) {
        dp[i][w] = Math.max(
          dp[i - 1][w],
          dp[i - 1][w - task.Duration] + task.Impact
        );
      } else {
        dp[i][w] = dp[i - 1][w];
      }
    }
  }

  const selected: Vehicle[] = [];
  let remaining = capacity;

  for (let i = n; i > 0; i--) {
    if (dp[i][remaining] !== dp[i - 1][remaining]) {
      selected.push(vehicles[i - 1]);
      remaining -= vehicles[i - 1].Duration;
    }
  }

  return { maxImpact: dp[n][capacity], selected: selected.reverse() };
}

export async function generateSchedule(
  depotId: number,
  mechanicHours: number,
  vehicles: Vehicle[]
): Promise<ScheduleResult> {
  await Log(
    "backend",
    "info",
    "service",
    `Running 0/1 knapsack optimization for depot ${depotId} | capacity: ${mechanicHours}h | tasks: ${vehicles.length}`
  );

  const startTime = Date.now();
  const { maxImpact, selected } = solveKnapsack(vehicles, mechanicHours);
  const elapsed = Date.now() - startTime;

  const totalDuration = selected.reduce((sum, v) => sum + v.Duration, 0);

  await Log(
    "backend",
    "info",
    "service",
    `Depot ${depotId} optimization complete in ${elapsed}ms | selected ${selected.length} tasks | impact: ${maxImpact} | duration: ${totalDuration}/${mechanicHours}h`
  );

  return {
    depotId,
    mechanicHours,
    totalImpact: maxImpact,
    totalDuration,
    selectedTasks: selected,
  };
}
