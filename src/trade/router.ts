import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler";
import { TradeController } from "./controller";

export function createTradeRouter(controller: TradeController): Router {
  const router = Router();
  router.post("/execute", asyncHandler(controller.executeTrade));
  return router;
}
