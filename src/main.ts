import { appConfig } from "./config";
import { db } from "./db/client";
import { DrizzleMessageRepository } from "./db/drizzle-message.repository";
import { runMigrations } from "./db/migrate";
import { CreateLogger } from "./logger";
import { ProviderClient } from "./provider/client";
import { TraversalService } from "./traversal/traversal.service";

async function main() {
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

  //build deps
  const providerClient = new ProviderClient(
    appConfig.provider.host + ":" + appConfig.provider.port,
    logger,
    abortController,
  );

  await runMigrations();

  const messageRepository = new DrizzleMessageRepository(db);

  const traversalService = new TraversalService(
    providerClient,
    messageRepository,
    logger,
    abortController.signal,
  );

  logger.info({ message: "All deps are ready" }, "Starting traversal");
  const timeStart = Date.now();
  await traversalService.run();
  const timeEnd = Date.now();
  const durationSeconds = (timeEnd - timeStart) / 1000;
  logger.info({ durationSeconds }, "Traversal is finished");

  logger.info({ message: "Shutting down SUCCESS" });
  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
