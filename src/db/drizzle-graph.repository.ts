import { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  ExternalId,
  GraphMessage,
  GraphMessageBatch,
  GraphRepository,
  ParentIdMessage,
} from "../repositories/graph.repository";
import * as schema from "./schema";
import { inArray, sql } from "drizzle-orm";

type Database = NodePgDatabase<typeof schema>;

type Reference = typeof schema.messageReferences.$inferSelect;
type Message = typeof schema.messages.$inferSelect;
type MessageWithReferences = Pick<Message, "externalId" | "inReplyTo"> &
  Partial<Pick<Reference, "referenceId" | "position">>;

type MessageToUpdate = Pick<Message, "externalId" | "parentId"> & {};

export class DrizzleGraphRepository implements GraphRepository {
  constructor(private readonly db: Database) {}

  async saveMessageBatch(batch: ParentIdMessage[]): Promise<void> {
    const filteredNull = batch.filter((message) => message.parentId !== null);

    if (filteredNull.length > 0) {
      await this.db.execute(
        sql`
      UPDATE messages AS m
      SET parent_id = v.parent_id
      FROM (
        VALUES ${sql.join(
          filteredNull.map(
            (message) => sql`(${message.id}, ${message.parentId})`,
          ),
          sql`, `,
        )}
      ) AS v(external_id, parent_id)
      WHERE m.external_id = v.external_id
    `,
      );
    }
  }

  async getMessageBatch(
    cursor: string | null,
    limit: number,
  ): Promise<GraphMessageBatch> {
    // ищем все сообщения и их референсы, сначала иещем батч мообщений а потом лефт join
    const result = await this.db.execute<MessageWithReferences>(sql`
                                       SELECT 
                                        m.external_id as "externalId",
                                        m.in_reply_to as "inReplyTo",
                                        r.reference_id as "referenceId",
                                        r.position
                                        
                                       FROM (
                                         SELECT
                                            external_id,
                                            in_reply_to
                                          FROM messages
                                          ${
                                            cursor
                                              ? sql`WHERE external_id > ${cursor}`
                                              : sql``
                                          }
                                          ORDER BY external_id
                                          LIMIT ${limit}
                                       ) m
                                       LEFT JOIN message_references r
                                        ON r.message_id = m.external_id
                                        ORDER BY m.external_id, r.position
                                       `);

    const messages = new Map<ExternalId, GraphMessage>();
    const extids = new Set<ExternalId>();
    for (const row of result.rows) {
      extids.add(row.externalId);
    }

    for (const row of result.rows) {
      let message = messages.get(row.externalId);

      if (!message) {
        message = {
          id: row.externalId,
          references: [],
          inReplyTo: row.inReplyTo ?? null,
        };

        messages.set(row.externalId, message);
      }

      if (row.referenceId != null) {
        message.references.push(row.referenceId);
      }
    }

    const refereceIdSet = new Set<ExternalId>();
    for (const message of messages.values()) {
      for (const reference of message.references) {
        refereceIdSet.add(reference);
      }
    }

    const existingsIds = await this.findExistinsId([...refereceIdSet]);

    return {
      messages: Array.from(messages.values()),
      existingsIds,
      nextCursor:
        result.rows.length > 0
          ? result.rows[result.rows.length - 1].externalId
          : null,
    };
  }

  private async findExistinsId(ids: ExternalId[]): Promise<Set<ExternalId>> {
    if (ids.length === 0) {
      return new Set();
    }

    const result = await this.db
      .select({
        id: schema.messages.externalId,
      })
      .from(schema.messages)
      .where(inArray(schema.messages.externalId, ids));

    return new Set(result.map((row) => row.id));
  }
}
