import { Log } from "logging-middleware";
import { Depot, DepotResponse } from "../types";
import { fetchFromApi } from "../utils/http";

export async function fetchDepots(): Promise<Depot[]> {
  await Log("backend", "info", "service", "Fetching depot list from evaluation API");

  const data = await fetchFromApi<DepotResponse>("/depots");

  await Log(
    "backend",
    "info",
    "service",
    `Retrieved ${data.depots.length} depots successfully`
  );

  return data.depots;
}

export async function fetchDepotById(depotId: number): Promise<Depot | undefined> {
  const depots = await fetchDepots();
  const depot = depots.find((d) => d.ID === depotId);

  if (!depot) {
    await Log(
      "backend",
      "warn",
      "service",
      `Depot ${depotId} not found among ${depots.length} available depots`
    );
  }

  return depot;
}
