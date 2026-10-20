CREATE TABLE `twitch_bot_ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`owner` text NOT NULL,
	`user_id` text NOT NULL,
	`login` text NOT NULL,
	`question` text NOT NULL,
	`answer` text,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `twitch_bot_ai_requests_channel` ON `twitch_bot_ai_requests` (`channel`,`created`);--> statement-breakpoint
CREATE INDEX `twitch_bot_ai_requests_user` ON `twitch_bot_ai_requests` (`channel`,`user_id`,`created`);--> statement-breakpoint
ALTER TABLE `twitch_bot_messages` ADD `reply_to` text;--> statement-breakpoint
ALTER TABLE `twitch_bot_settings` ADD `ai_replies` integer DEFAULT 1 NOT NULL;