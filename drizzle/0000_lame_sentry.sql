CREATE TABLE "message_references" (
	"message_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "message_references_message_id_position_pk" PRIMARY KEY("message_id","position")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"external_id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"in_reply_to" text,
	"parent_id" text,
	"thread_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traversal_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"next_cursor" text,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_references" ADD CONSTRAINT "message_references_message_id_messages_external_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("external_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_references_reference_id_idx" ON "message_references" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "message_parent_id_idx" ON "messages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "message_thread_key_idx" ON "messages" USING btree ("thread_key");