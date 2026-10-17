import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouter from "./ai";
import sharedRouter from "./shared";
import uploadsRouter from "./uploads";
import publisherRouter from "./publisher";
import discordRouter from "./discord";
import mercatoRouter from "./mercato";
import leagueRouter from "./league";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouter);
router.use(uploadsRouter);
router.use(sharedRouter);
router.use(publisherRouter);
router.use(discordRouter);
router.use(mercatoRouter);
router.use(leagueRouter);

export default router;
