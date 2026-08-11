import pino from "pino";
import { appConfig } from "./config";

export const CreateLogger = (config: typeof appConfig): pino.Logger => {
  return pino({
    level: config.logger.level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  });
};
