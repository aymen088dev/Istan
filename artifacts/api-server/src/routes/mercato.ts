import { Router, type IRouter } from "express";
import {
  DEFAULT_CHANNEL_ID,
  DEFAULT_MONTHS,
  MAX_MONTHS,
  findJob,
  latestJob,
  readReport,
  startAnalysis,
} from "../lib/mercato";
import { readDiscordBotToken, readGroqKey } from "../lib/tokenConfig";

/**
 * Analyseur mercato — API du portail indépendant `/mercato/`.
 *
 * - `GET  /api/mercato/status`  : configuration (clés présentes ou non) et
 *   progression du dernier job, sans jamais renvoyer un secret.
 * - `POST /api/mercato/analyze` : démarre une analyse des N derniers mois.
 * - `GET  /api/mercato/report`  : dernier rapport enregistré.
 */

const router: IRouter = Router();

router.get("/mercato/status", async (_req, res): Promise<void> => {
  const [discord, groq, report] = await Promise.all([readDiscordBotToken(), readGroqKey(), readReport()]);
  const job = latestJob();
  res.json({
    channelId: process.env.MERCATO_CHANNEL_ID || DEFAULT_CHANNEL_ID,
    months: DEFAULT_MONTHS,
    maxMonths: MAX_MONTHS,
    configured: {
      discordBotToken: Boolean(discord.token),
      discordSource: discord.source,
      groqKey: Boolean(groq),
    },
    job,
    report: report
      ? {
          generatedAt: report.generatedAt,
          since: report.since,
          until: report.until,
          messageCount: report.messageCount,
          analyzedMessages: report.analyzedMessages,
          transfers: report.transfers.length,
          batches: report.batches,
          failedBatches: report.failedBatches,
          channelName: report.channelName,
        }
      : null,
  });
});

router.post("/mercato/analyze", (req, res): void => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const job = startAnalysis({ channelId: body.channelId, months: body.months });
    res.status(202).json({ job });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.get("/mercato/jobs/:id", (req, res): void => {
  const job = findJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Analyse introuvable." });
    return;
  }
  res.json({ job });
});

router.get("/mercato/report", async (_req, res): Promise<void> => {
  const report = await readReport();
  if (!report) {
    res.status(404).json({ error: "Aucune analyse enregistrée pour l'instant." });
    return;
  }
  res.json(report);
});

export default router;
