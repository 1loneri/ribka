CREATE TABLE `fishing_accounts` (
	`user` text PRIMARY KEY NOT NULL,
	`twitch_id` text NOT NULL,
	`username` text NOT NULL,
	`linked_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `twitch_states` ADD `purpose` text DEFAULT 'streamer' NOT NULL;