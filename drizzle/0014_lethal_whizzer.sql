CREATE TABLE `twitch_bot_channels` (
	`channel` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`broadcaster` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_bot_connections` (
	`user` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`broadcaster` text NOT NULL,
	`channel` text NOT NULL,
	`access` text NOT NULL,
	`refresh` text NOT NULL,
	`expires` integer NOT NULL,
	`scopes` text NOT NULL
);
