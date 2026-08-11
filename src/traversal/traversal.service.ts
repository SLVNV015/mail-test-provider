import pino from "pino";
import { ProviderClient } from "../provider/client";
import { MessageRepository } from "../repositories/messages.repository";

export class TraversalService {
  /**
   * @param providerClient - клиет для опроса провайдера емейлоф
   * @param messageRepository - репозиторий для сохранения сообщений
   * @param logger -
   * @param signal - глобальный сигнал шутдаунаол
   */
  constructor(
    private readonly providerClient: ProviderClient,
    private readonly messageRepository: MessageRepository,
    private readonly logger: pino.Logger,
    private readonly signal: AbortSignal,
  ) {}

  public async run(): Promise<void> {
    const state = await this.messageRepository.getState();

    if (state.complited) {
      this.logger.info({ message: "Traversal is already finished" });
      return;
    }

    let cursor = state.nextCursor;
    if (!cursor) {
      this.logger.info({ message: "Start traversal without cursor" });
    } else {
      this.logger.info({ message: "Start traversal with cursor", cursor });
    }

    while (!this.signal.aborted) {
      this.logger.info({ cursor }, "Fetching message page");

      const page = await this.providerClient.getMessages(cursor);
      this.logger.info(
        {
          cursor,
          items: page.items.length,
          next_cursor: page.next_cursor,
        },
        "Message page recieved",
      );

      await this.messageRepository.savePage(page);

      if (page.next_cursor === null) {
        this.logger.info({ message: "Traversal is finished" });
        return;
      }

      cursor = page.next_cursor;
    }
  }
}
