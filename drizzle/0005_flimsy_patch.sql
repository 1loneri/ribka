CREATE TABLE `twitch_connections` (
	`user` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`broadcaster` text NOT NULL,
	`channel` text NOT NULL,
	`access` text NOT NULL,
	`refresh` text NOT NULL,
	`expires` integer NOT NULL,
	`scopes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_states` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`email` text NOT NULL,
	`expected` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `giveaways` ADD `reward_id` text;