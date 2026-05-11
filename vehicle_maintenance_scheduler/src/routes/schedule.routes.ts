import { Router } from "express";
import {
  getScheduleByDepot,
  getAllSchedules,
  getDepots,
  getVehicles,
} from "../controllers/schedule.controller";

const router = Router();

router.get("/schedule", getAllSchedules);
router.get("/schedule/:depotId", getScheduleByDepot);
router.get("/depots", getDepots);
router.get("/vehicles", getVehicles);

export default router;
