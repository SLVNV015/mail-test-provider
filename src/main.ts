import { appConfig } from "./config";
import { db } from "./db/client";
import { DrizzleGraphRepository } from "./db/drizzle-graph.repository";
import { DrizzleMessageRepository } from "./db/drizzle-message.repository";
import { DrizzleThreadRepository } from "./db/drizzle-thread.repository";
import { runMigrations } from "./db/migrate";
import { CreateLogger } from "./logger";
import { ProviderClient } from "./provider/client";
import { ParentResolver } from "./thread-resolver/parent-resolver";
import { ThreadResolver } from "./thread-resolver/thread-resolver";
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
  const graphRepository = new DrizzleGraphRepository(db);
  const threadRepository = new DrizzleThreadRepository(db);

  const threadResolver = new ThreadResolver(threadRepository, logger);

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

  const parentResolver = new ParentResolver(graphRepository, logger);
  const timeStart2 = Date.now();
  await parentResolver.resolveAll();

  const timeEnd2 = Date.now();
  const durationSeconds2 = (timeEnd2 - timeStart2) / 1000;
  logger.info({ durationSeconds2 }, "Parent resolving is finished");

  await threadResolver.fillDsu();
  await threadResolver.resolveThreads();

  await shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
