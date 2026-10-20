CREATE TABLE `fishing_games` (
	`channel` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`host` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`collector_token` text,
	`collector_until` integer,
	`event_id` text,
	`active_until` integer DEFAULT 0 NOT NULL,
	`next_event` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fishing_log` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`username` text NOT NULL,
	`message` text NOT NULL,
	`item_id` text,
	`chance` integer,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fishing_players` (
	`channel` text NOT NULL,
	`username` text NOT NULL,
	`state` text NOT NULL,
	`rev` integer DEFAULT 0 NOT NULL,
	`coins` integer DEFAULT 0 NOT NULL,
	`catches` integer DEFAULT 0 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`channel`, `username`)
);
