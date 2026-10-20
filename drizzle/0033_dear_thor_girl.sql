CREATE TABLE `community_mystery_events` (
	`channel` text NOT NULL,
	`message_id` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`channel`, `message_id`)
);
--> statement-breakpoint
CREATE TABLE `community_mystery_guesses` (
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`guess` text NOT NULL,
	`attempts` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`round_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `community_mystery_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`owner` text NOT NULL,
	`target_id` text NOT NULL,
	`target_login` text NOT NULL,
	`target_name` text NOT NULL,
	`avatar` text NOT NULL,
	`message_ids` text NOT NULL,
	`state` text NOT NULL,
	`active` integer,
	`created` integer NOT NULL,
	`ends` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_mystery_active` ON `community_mystery_rounds` (`channel`,`active`);--> statement-breakpoint
CREATE INDEX `community_mystery_recent` ON `community_mystery_rounds` (`channel`,`created`);--> statement-breakpoint
CREATE TABLE `community_room_polls` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`owner` text NOT NULL,
	`slot` text NOT NULL,
	`state` text NOT NULL,
	`active` integer,
	`created` integer NOT NULL,
	`ends` integer NOT NULL,
	`winner` text,
	`settled` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_room_active` ON `community_room_polls` (`channel`,`active`);--> statement-breakpoint
CREATE INDEX `community_room_recent` ON `community_room_polls` (`channel`,`created`);--> statement-breakpoint
CREATE TABLE `community_room_votes` (
	`poll_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`choice` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`poll_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `community_rooms` (
	`channel` text PRIMARY KEY NOT NULL,
	`layout` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
