import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import {
  ButhcOfThreadEdges,
  ThreadKeyDto,
  ThreadRepository,
} from "../repositories/thread.repository";
import { ExternalId } from "../repositories/graph.repository";
import { asc, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";

type Database = NodePgDatabase<typeof schema>;

export class DrizzleThreadRepository implements ThreadRepository {
  constructor(private readonly db: Database) {}

  async updateThreads(threadKeyDto: ThreadKeyDto[]): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async getThreadEdgesBatch(
    cursot: ExternalId | null,
    limit: number,
  ): Promise<ButhcOfThreadEdges> {
    const batchIds = await this.db
      .select({
        externalId: schema.messages.externalId,
      })
      .from(schema.messages)
      .limit(limit)
      .where(
        cursot
          ? gt(schema.messages.externalId, cursot)
          : isNotNull(schema.messages.externalId),
      );

    const replyMessages = aliasedTable(schema.messages, "reply");

    const messages = await this.db
      .select({
        messageId: schema.messageReferences.messageId,
        referenceId: schema.messageReferences.referenceId,
        inReplyTo: schema.messages.inReplyTo,
      })
      .from(schema.messageReferences)
      .innerJoin(
        schema.messages,
        eq(schema.messages.externalId, schema.messageReferences.referenceId),
      )
      .innerJoin(
        replyMessages,
        or(
          isNotNull(schema.messages.inReplyTo),
          eq(replyMessages.externalId, schema.messages.inReplyTo),
        ),
      )
      .where(
        inArray(
          schema.messageReferences.messageId,
          batchIds.map((row) => row.externalId),
        ),
      )
      .orderBy(
        asc(schema.messageReferences.messageId),
        asc(schema.messageReferences.position),
      );

    if (messages.length === 0) {
      return {
        edges: [],
        nextCursor: null,
      };
    }

    const lastMessage = messages[messages.length - 1];
    const nextCursor = messages.length === limit ? lastMessage.messageId : null;

    return {
      nextCursor,
      edges: messages.map((message) => ({
        messageId: message.messageId,
        referenceId: message.referenceId,
        inReplyTo: message.inReplyTo,
      })),
    };
  }
}
