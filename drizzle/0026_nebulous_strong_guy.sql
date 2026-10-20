CREATE TABLE `level_channels` (
	`channel` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`appearance` text DEFAULT '{}' NOT NULL,
	`stream_id` text,
	`stream_started` integer DEFAULT 0 NOT NULL,
	`stream_live` integer DEFAULT 0 NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`sync_until` integer DEFAULT 0 NOT NULL,
	`stream_event_at` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `level_events` (
	`channel` text NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stream_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created` integer NOT NULL,
	`eligible` integer NOT NULL,
	`nonce` text NOT NULL,
	PRIMARY KEY(`channel`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `level_events_duplicates` ON `level_events` (`channel`,`user_id`,`fingerprint`,`created`);--> statement-breakpoint
CREATE INDEX `level_events_created` ON `level_events` (`channel`,`created`);--> statement-breakpoint
CREATE TABLE `level_players` (
	`channel` text NOT NULL,
	`user_id` text NOT NULL,
	`login` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`messages` integer DEFAULT 0 NOT NULL,
	`last_earned` integer DEFAULT 0 NOT NULL,
	`last_seen` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`channel`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `level_players_ranking` ON `level_players` (`channel`,`xp`);--> statement-breakpoint
CREATE TABLE `level_sessions` (
	`channel` text NOT NULL,
	`stream_id` text NOT NULL,
	`user_id` text NOT NULL,
	`messages` integer DEFAULT 0 NOT NULL,
	`earned` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`channel`, `stream_id`, `user_id`)
);
