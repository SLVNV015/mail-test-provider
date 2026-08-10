import { appConfig } from "./config";
import { CreateLogger } from "./logger";
import { ProviderClient } from "./provider/client";
import { Message, Page } from "./provider/schema";

async function main() {
  const logger = CreateLogger(appConfig);

  const abortController = new AbortController();

  logger.info({
    config: appConfig,
  });

  const providerClient = new ProviderClient(
    appConfig.provider.host + ":" + appConfig.provider.port,
    logger,
    abortController,
  );

  const storage: Array<Message> = [];

  try {
    logger.info({ message: "Get messages" });
    let page: Page = await providerClient.getMessages();
    storage.push(...page.items);

    while (page.next_cursor) {
      page = await providerClient.getMessages(page.next_cursor);
    }
  } catch (error) {
    logger.error({ error });
  }

  logger.info({ messages: storage.length });
  const randomMsg = storage[Math.floor(Math.random() * storage.length)];
  logger.info({ randomMsg });
}

main();
