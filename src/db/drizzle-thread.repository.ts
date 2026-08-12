import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import {
  ButhcOfThreadEdges,
  ThreadKeyDto,
  ThreadRepository,
} from "../repositories/thread.repository";
import { ExternalId } from "../repositories/graph.repository";
import { asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import {
  ExportedDataBatch,
  ExporterDataRepository,
} from "../repositories/exporter.repository";

type Database = NodePgDatabase<typeof schema>;

export class DrizzleThreadRepository
  implements ThreadRepository, ExporterDataRepository
{
  constructor(private readonly db: Database) {}
  async getBatch(
    cursor: string | null,
    limit: number,
  ): Promise<ExportedDataBatch> {
    const data = await this.db
      .select({
        external_id: schema.messages.externalId,
        thread_key: schema.messages.threadKey,
        parent_id: schema.messages.parentId,
        sent_at: schema.messages.sentAt,
        subject: schema.messages.subject,
      })
      .from(schema.messages)
      .limit(limit)
      .where(
        cursor
          ? gt(schema.messages.externalId, cursor)
          : isNotNull(schema.messages.externalId),
      )
      .orderBy(asc(schema.messages.externalId));

    const nextCursor =
      data.length < limit ? null : data[data.length - 1].external_id;

    return {
      data: data.map((d) => ({
        ...d,
        sent_at: d.sent_at.toISOString(),
      })),
      nextCursor,
    };
  }

  async getMessageIdsBatch(
    cursor: ExternalId | null,
    limit: number,
  ): Promise<{ messages: ExternalId[]; nextCursor: ExternalId | null }> {
    const messages = await this.db
      .select({
        id: schema.messages.externalId,
      })
      .from(schema.messages)
      .limit(limit)
      .where(
        cursor
          ? gt(schema.messages.externalId, cursor)
          : isNotNull(schema.messages.externalId),
      );

    const nextCursor =
      messages.length < limit ? null : messages[messages.length - 1].id;

    return {
      nextCursor,
      messages: messages.map((message) => message.id),
    };
  }

  async updateThreads(threadKeyDto: ThreadKeyDto[]): Promise<void> {
    const filteredNull = threadKeyDto.filter((data) => data.threadKey !== null);

    if (filteredNull.length > 0) {
      await this.db.execute(
        sql`
      UPDATE messages AS m
      SET thread_key = v.thread_key
      FROM (
        VALUES ${sql.join(
          filteredNull.map(
            (data) => sql`(${data.externalId}, ${data.threadKey})`,
          ),
          sql`, `,
        )}
      ) AS v(external_id, thread_key)
      WHERE m.external_id = v.external_id
    `,
      );
    }
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
      )
      .orderBy(asc(schema.messages.externalId));

    if (batchIds.length === 0) {
      return {
        edges: [],
        nextCursor: null,
      };
    }

    const aliasedMessages = aliasedTable(schema.messages, "m");
    // берем все ссылки  джойним сообщения так отсекаются левые референсы, попадают только существующие
    const referenceEdges = this.db
      .select({
        from: schema.messageReferences.messageId,
        to: schema.messageReferences.referenceId,
      })
      .from(schema.messageReferences)
      .innerJoin(
        schema.messages,
        eq(schema.messages.externalId, schema.messageReferences.referenceId),
      )
      .where(
        inArray(
          schema.messageReferences.messageId,
          batchIds.map((id) => id.externalId),
        ),
      );

    // так же берем только сообщения где указаны реплаи и эти реплаи существуют
    const replyEdges = this.db
      .select({
        from: schema.messages.externalId,
        to: aliasedMessages.externalId,
      })
      .from(schema.messages)
      .innerJoin(
        aliasedMessages,
        eq(aliasedMessages.externalId, schema.messages.inReplyTo),
      )
      .where(
        inArray(
          schema.messages.externalId,
          batchIds.map((id) => id.externalId),
        ),
      );

    const edges = await unionAll(referenceEdges, replyEdges);

    return {
      edges,
      nextCursor: batchIds[batchIds.length - 1].externalId,
    };
  }
}
