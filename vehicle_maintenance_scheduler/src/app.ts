import express from "express";
import scheduleRoutes from "./routes/schedule.routes";
import { errorHandler, requestLogger, notFoundHandler } from "./middleware/error.middleware";

const app = express();

app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "vehicle-maintenance-scheduler" });
});

app.use("/api/v1", scheduleRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
