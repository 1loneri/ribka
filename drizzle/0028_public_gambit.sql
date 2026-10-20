CREATE TABLE `level_months` (
	`channel` text NOT NULL,
	`month` text NOT NULL,
	`user_id` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`messages` integer DEFAULT 0 NOT NULL,
	`last_earned` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	PRIMARY KEY(`channel`, `month`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `level_months_ranking` ON `level_months` (`channel`,`month`,`xp`);--> statement-breakpoint
CREATE TABLE `rank_guess_games` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`owner` text NOT NULL,
	`review_id` text NOT NULL,
	`answer` text NOT NULL,
	`state` text DEFAULT 'voting' NOT NULL,
	`created` integer NOT NULL,
	`vote_ends` integer NOT NULL,
	`expires` integer NOT NULL,
	`revealed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_guess_active_channel` ON `rank_guess_games` (`channel`) WHERE "rank_guess_games"."state" = 'voting';--> statement-breakpoint
CREATE INDEX `rank_guess_recent` ON `rank_guess_games` (`channel`,`created`);--> statement-breakpoint
CREATE INDEX `rank_guess_review` ON `rank_guess_games` (`review_id`,`state`);--> statement-breakpoint
CREATE TABLE `rank_guess_votes` (
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`choice` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`game_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `rank_guess_results` ON `rank_guess_votes` (`game_id`,`choice`);--> statement-breakpoint
ALTER TABLE `level_profiles` ADD `title_id` text DEFAULT 'none' NOT NULL;