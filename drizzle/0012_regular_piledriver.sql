CREATE TABLE `twitch_bot_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created` integer NOT NULL,
	`ready_at` integer NOT NULL,
	`expires` integer NOT NULL,
	`twitch_id` text
);
--> statement-breakpoint
CREATE INDEX `twitch_bot_messages_delivery` ON `twitch_bot_messages` (`channel`,`status`,`ready_at`);--> statement-breakpoint
CREATE TABLE `twitch_bot_settings` (
	`channel` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`fish_replies` integer DEFAULT 1 NOT NULL,
	`winner_announcements` integer DEFAULT 1 NOT NULL,
	`next_send` integer DEFAULT 0 NOT NULL,
	`sending_until` integer DEFAULT 0 NOT NULL,
	`send_token` text,
	`last_sent` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`reconnect` integer DEFAULT 0 NOT NULL
);
