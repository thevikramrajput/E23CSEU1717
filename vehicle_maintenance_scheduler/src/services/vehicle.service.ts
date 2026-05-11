import { Log } from "logging-middleware";
import { Vehicle, VehicleResponse } from "../types";
import { fetchFromApi } from "../utils/http";

export async function fetchVehicles(): Promise<Vehicle[]> {
  await Log("backend", "info", "service", "Fetching vehicle task list from evaluation API");

  const data = await fetchFromApi<VehicleResponse>("/vehicles");

  await Log(
    "backend",
    "info",
    "service",
    `Retrieved ${data.vehicles.length} vehicle maintenance tasks`
  );

  return data.vehicles;
}
