import { appConfig } from "./config";
import { db } from "./db/client";
import { DrizzleThreadRepository } from "./db/drizzle-thread.repository";
import { ExporterService } from "./exporter/exporter.service";
import { CreateLogger } from "./logger";

async function exporter(): Promise<void> {
  const logger = CreateLogger(appConfig);

  const abortController = new AbortController();
  let shuttingDown = false;

  //setup shutting down
  const shutdown = async () => {
    if (shuttingDown) return;

    shuttingDown = true;
    logger.info({ message: "Shutting down" });
    abortController.abort();
    await db.$client
      .end()
      .catch((err) => logger.error(err, "DB close while shutting down error"));

    logger.info({ message: "Shutting down complete" });
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("uncaughtException", (err) => {
    logger.error(err, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (err) => {
    logger.error(err, "Unhandled rejection");
    process.exit(1);
  });
  logger.info({
    config: appConfig,
  });

  //buidls
  const threadRepository = new DrizzleThreadRepository(db);
  const exporterService = new ExporterService(threadRepository, logger);
  await exporterService.export();

  return;
}

exporter()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
