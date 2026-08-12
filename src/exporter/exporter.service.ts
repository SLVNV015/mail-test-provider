import pino from "pino";
import { ExporterDataRepository } from "../repositories/exporter.repository";
import { createWriteStream } from "fs";
import fs from "fs";
import path from "path";

export class ExporterService {
  constructor(
    private readonly threadRepository: ExporterDataRepository,
    private readonly logger: pino.Logger,
  ) {}

  async export(): Promise<void> {
    this.logger.info({ message: "Starting export" });

    const fullDir = path.join(process.cwd(), "out");

    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }

    const filename = "result.jsonl";
    const fullFilename = path.join(fullDir, filename);
    const writer = createWriteStream(fullFilename, { encoding: "utf-8" });

    let cursor: string | null = null;

    try {
      while (true) {
        const { data, nextCursor } = await this.threadRepository.getBatch(
          cursor,
          5_000,
        );

        if (!data || data.length === 0) {
          break;
        }

        for (const item of data) {
          writer.write(JSON.stringify(item));
          writer.write("\n");
        }

        if (!nextCursor || nextCursor === cursor) {
          break;
        }

        cursor = nextCursor;
      }

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", () => {
          this.logger.info({
            message: "File stream successfully flushed to disk",
          });
          resolve();
        });
        writer.on("error", reject);
        writer.end();
      });

      this.logger.info({ message: "Export finished successfully" });
    } catch (error) {
      this.logger.error({ message: "Export failed", error });
      throw error;
    }
  }
}
