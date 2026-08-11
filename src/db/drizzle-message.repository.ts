import { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Page } from "../provider/schema";
import {
  MessageRepository,
  TraversalState,
} from "../repositories/messages.repository";
import * as schema from "./schema";
import { eq } from "drizzle-orm";

type Database = NodePgDatabase<typeof schema>;

export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: Database) {}

  async getState(): Promise<TraversalState> {
    const [state] = await this.db
      .select()
      .from(schema.traversalState)
      .where(eq(schema.traversalState.id, 1))
      .limit(1);

    if (!state) {
      await this.db.insert(schema.traversalState).values({
        id: 1,
        nextCursor: null,
        completed: false,
      });
      return {
        nextCursor: null,
        complited: false,
      };
    }

    return {
      complited: state.completed,
      nextCursor: state.nextCursor,
    };
  }

  async savePage(page: Page): Promise<void> {
    await this.db.transaction(async (tx) => {
      const messages: Array<typeof schema.messages.$inferInsert> =
        page.items.map((message) => ({
          externalId: message.message_id,
          subject: message.subject,
          sentAt: new Date(message.sent_at),
          inReplyTo: message.in_reply_to ?? null,
        }));

      if (messages.length > 0) {
        await tx.insert(schema.messages).values(messages).onConflictDoNothing();
      }

      type TMessageREferences = typeof schema.messageReferences.$inferInsert;

      const references: Array<TMessageREferences> = page.items.flatMap(
        (message) => {
          return message.references.map<TMessageREferences>(
            (referenceId, position) => ({
              messageId: message.message_id,
              referenceId: referenceId,
              position: position,
            }),
          );
        },
      );

      if (references.length > 0) {
        await tx
          .insert(schema.messageReferences)
          .values(references)
          .onConflictDoNothing();
      }

      await tx
        .update(schema.traversalState)
        .set({
          nextCursor: page.next_cursor,
          completed: page.next_cursor === null,
          updatedAt: new Date(),
        })
        .where(eq(schema.traversalState.id, 1));
    });
  }
}
