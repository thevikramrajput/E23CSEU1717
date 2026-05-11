import { Request, Response, NextFunction } from "express";
import { Log } from "logging-middleware";
import { fetchDepotById, fetchDepots } from "../services/depot.service";
import { fetchVehicles } from "../services/vehicle.service";
import { generateSchedule } from "../services/scheduler.service";

export async function getScheduleByDepot(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const depotId = parseInt(req.params.depotId, 10);

    if (isNaN(depotId) || depotId <= 0) {
      await Log(
        "backend",
        "warn",
        "controller",
        `Invalid depot ID parameter received: ${req.params.depotId}`
      );
      res.status(400).json({
        success: false,
        error: `Invalid depot ID: ${req.params.depotId}`,
      });
      return;
    }

    await Log("backend", "info", "controller", `Schedule request for depot ${depotId}`);

    const depot = await fetchDepotById(depotId);
    if (!depot) {
      res.status(404).json({
        success: false,
        error: `Depot with ID ${depotId} does not exist`,
      });
      return;
    }

    const vehicles = await fetchVehicles();
    const schedule = await generateSchedule(depot.ID, depot.MechanicHours, vehicles);

    await Log(
      "backend",
      "info",
      "controller",
      `Schedule response ready for depot ${depotId} with ${schedule.selectedTasks.length} tasks`
    );

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
}

export async function getAllSchedules(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await Log("backend", "info", "controller", "Generating optimized schedules for all depots");

    const [depots, vehicles] = await Promise.all([fetchDepots(), fetchVehicles()]);

    const schedules = [];
    for (const depot of depots) {
      const schedule = await generateSchedule(depot.ID, depot.MechanicHours, vehicles);
      schedules.push(schedule);
    }

    await Log(
      "backend",
      "info",
      "controller",
      `Generated schedules for ${depots.length} depots successfully`
    );

    res.json({ success: true, data: schedules });
  } catch (err) {
    next(err);
  }
}

export async function getDepots(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await Log("backend", "info", "controller", "Fetching depot information");
    const depots = await fetchDepots();
    res.json({ success: true, data: depots });
  } catch (err) {
    next(err);
  }
}

export async function getVehicles(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await Log("backend", "info", "controller", "Fetching vehicle task list");
    const vehicles = await fetchVehicles();
    res.json({ success: true, data: vehicles });
  } catch (err) {
    next(err);
  }
}
