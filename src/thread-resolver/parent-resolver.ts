import pino from "pino";
import {
  ExternalId,
  GraphMessage,
  GraphRepository,
  ParentIdMessage,
} from "../repositories/graph.repository";

export class ParentResolver {
  constructor(
    private readonly graphRepository: GraphRepository,
    private readonly logger: pino.Logger,
  ) {}

  private readonly BATCH_SIZE = 1_000;

  public async resolveAll(): Promise<void> {
    this.logger.info({ message: "Start parent resolving" });
    let tottalBatchCount = 0;

    let cursor: ExternalId | null = null;

    while (true) {
      const batch = await this.graphRepository.getMessageBatch(
        cursor,
        this.BATCH_SIZE,
      );
      // this.logger.info(
      //   {
      //     cursor,
      //     items: batch.messages.length,
      //     next_cursor: batch.nextCursor,
      //   },
      //   "Message batch recieved",
      // );

      if (batch.messages.length === 0) {
        break;
      }
      tottalBatchCount++;

      const parents: ParentIdMessage[] = batch.messages.map((message) => {
        return {
          id: message.id,
          parentId: this.resolveOne(message, batch.existingsIds),
        };
      });

      await this.graphRepository.saveMessageBatch(parents);

      cursor = batch.nextCursor;
      if (cursor === null) {
        break;
      }
    }

    this.logger.info(
      { totalBatchCount: tottalBatchCount },
      "Parent resolving complete",
    );
  }

  /**
   * @param message - Partial сообщения
   * @param existingIds - список существующих id из батча
   * @returns id родителя или null
   */
  private resolveOne(
    message: GraphMessage,
    existingIds: Set<ExternalId>,
  ): ExternalId | null {
    // Проходим references от конца к началу
    if (message.references && message.references.length > 0) {
      for (let i = message.references.length - 1; i >= 0; i--) {
        const reference = message.references[i];
        if (existingIds.has(reference)) {
          return reference;
        }
      }
    }

    // Проверяем in_reply_to только если не нашли в references
    if (message.inReplyTo && existingIds.has(message.inReplyTo)) {
      return message.inReplyTo;
    }

    return null;
  }
}
