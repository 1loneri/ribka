CREATE TABLE `chat_channels` (
	`channel` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`collector_token` text,
	`collector_until` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text,
	`state` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`created` integer NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_channel_id` ON `chat_messages` (`channel`,`message_id`);--> statement-breakpoint
CREATE INDEX `chat_messages_channel_seq` ON `chat_messages` (`channel`,`seq`);