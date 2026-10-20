CREATE TABLE `streamers` (
	`email` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streamers_channel_unique` ON `streamers` (`channel`);--> statement-breakpoint
ALTER TABLE `giveaways` ADD `channel` text;