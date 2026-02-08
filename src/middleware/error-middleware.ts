import { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error";
import { Logger } from "../lib/logger";

export function createErrorMiddleware(logger: Logger) {
  return (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }

    const err = error instanceof Error ? error : new Error("Unknown error");
    logger.error("Unhandled request error", {
      path: req.path,
      method: req.method,
      message: err.message
    });

    res.status(500).json({ error: "Internal server error" });
  };
}
