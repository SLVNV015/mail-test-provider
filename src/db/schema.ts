import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const messages = pgTable(
  "messages",
  {
    externalId: text("external_id").primaryKey(),
    subject: text("subject").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    inReplyTo: text("in_reply_to"),
    parentId: text("parent_id"),
    threadKey: text("thread_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("message_parent_id_idx").on(table.parentId),
    index("message_thread_key_idx").on(table.threadKey),
  ],
);

export const messageReferences = pgTable(
  "message_references",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.externalId, { onDelete: "cascade" }),
    referenceId: text("reference_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.position] }),
    index("message_references_reference_id_idx").on(table.referenceId),
  ],
);

export const traversalState = pgTable("traversal_state", {
  id: integer("id").primaryKey(),
  nextCursor: text("next_cursor"),
  completed: boolean("completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
