ALTER TABLE `twitch_bot_settings` ADD `ai_error` text;--> statement-breakpoint
ALTER TABLE `twitch_bot_settings` ADD `ai_retry_after` integer DEFAULT 0 NOT NULL;