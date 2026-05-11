import { Request, Response, NextFunction } from "express";
import { Log } from "logging-middleware";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  Log(
    "backend",
    "error",
    "middleware",
    `Unhandled error on ${req.method} ${req.path}: ${err.message}`
  );

  res.status(500).json({
    success: false,
    error: "An internal error occurred while processing the request",
  });
}

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  Log("backend", "info", "middleware", `${req.method} ${req.path} - incoming request`);
  next();
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: "The requested endpoint does not exist",
  });
}
