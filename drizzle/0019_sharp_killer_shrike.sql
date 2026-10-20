CREATE TABLE `fishing_duel_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`username` text NOT NULL,
	`command` text NOT NULL,
	`nonce` text NOT NULL,
	`message` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fishing_duel_commands_cooldown` ON `fishing_duel_commands` (`channel`,`username`,`created`);--> statement-breakpoint
CREATE TABLE `fishing_duel_locks` (
	`channel` text NOT NULL,
	`username` text NOT NULL,
	`duel` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`channel`, `username`)
);
--> statement-breakpoint
CREATE TABLE `fishing_duels` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`challenger` text NOT NULL,
	`opponent` text NOT NULL,
	`challenger_fish` text NOT NULL,
	`opponent_fish` text,
	`created` integer NOT NULL,
	`expires` integer NOT NULL,
	`resolved` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`winner` text,
	`challenger_score` integer,
	`opponent_score` integer
);
--> statement-breakpoint
CREATE INDEX `fishing_duels_channel_time` ON `fishing_duels` (`channel`,`created`);