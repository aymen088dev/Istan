import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import sharedRouter from "./shared";
import uploadsRouter from "./uploads";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(uploadsRouter);
router.use(sharedRouter);

export default router;
