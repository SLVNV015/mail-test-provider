import pino from "pino";
import {
  ThreadKeyDto,
  ThreadRepository,
} from "../repositories/thread.repository";
import { DisjointSet } from "./dsu";
import { ExternalId } from "../repositories/graph.repository";

export class ThreadResolver {
  constructor(
    private readonly threadRepository: ThreadRepository,
    private readonly logger: pino.Logger,
  ) {}

  private readonly BATCH_SIZE = 2_000;
  private DSU = new DisjointSet();

  async fillDsu(): Promise<void> {
    this.logger.info("Start resolving threads");
    this.logger.info("Bathed Fill DSU");

    const startTime = Date.now();
    const memoryUsageBefore = process.memoryUsage().rss / 1024 / 1024;

    let cursor: ExternalId | null = null;
    let batchCount = 0;

    while (true) {
      const batch = await this.threadRepository.getThreadEdgesBatch(
        cursor,
        this.BATCH_SIZE,
      );
      this.logger.info(
        {
          cursor,
          items: batch.edges.length,
          next_cursor: batch.nextCursor,
        },
        "Message batch recieved",
      );

      if (batch.edges.length === 0) {
        break;
      }

      batchCount++;

      for (const edge of batch.edges) {
        this.DSU.union(edge.from, edge.to);
      }

      cursor = batch.nextCursor;
      if (cursor === null) {
        break;
      }
    }

    const endTime = Date.now();
    const timeToFillSeconds = (endTime - startTime) / 1000;
    const memoryUsageAfter = process.memoryUsage().rss / 1024 / 1024;
    //MB
    const memoryUsageDiff = memoryUsageAfter - memoryUsageBefore;

    this.logger.info(
      {
        batchCount,
        timeToFillSeconds,
        memoryUsageDiff,
      },
      "Thread fill DSU completed",
    );

    return;
  }

  async resolveThreads(): Promise<void> {
    this.logger.info("Start resolving threads");
    const startTime = Date.now();

    let cursor: ExternalId | null = null;
    let batchCount = 0;

    while (true) {
      const batch = await this.threadRepository.getMessageIdsBatch(
        cursor,
        this.BATCH_SIZE,
      );
      this.logger.info(
        {
          cursor,
          items: batch.messages.length,
          next_cursor: batch.nextCursor,
        },
        "Message batch recieved",
      );

      if (batch.messages.length === 0) {
        break;
      }
      batchCount++;

      const updates: ThreadKeyDto[] = batch.messages.map((el) => ({
        externalId: el,
        threadKey: this.DSU.find(el),
      }));

      await this.threadRepository.updateThreads(updates);

      cursor = batch.nextCursor;
      if (cursor === null) {
        break;
      }
    }

    const endTime = Date.now();
    const timeToFillSeconds = (endTime - startTime) / 1000;

    this.logger.info(
      {
        batchCount,
        timeToFillSeconds,
      },
      "Thread resolving completed",
    );

    this.clearDSU();
  }

  private clearDSU(): void {
    this.DSU = new DisjointSet();
  }
}
