import z from "zod";

export const messageSchema = z.object({
  message_id: z.string(),
  in_reply_to: z.string().nullish(),
  references: z.array(z.string()),
  subject: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  sent_at: z.iso.datetime(),
});

export const pageSchema = z.object({
  items: z.array(messageSchema),
  next_cursor: z.string().nullable(),
});

export type Message = z.infer<typeof messageSchema>;
export type Page = z.infer<typeof pageSchema>;
