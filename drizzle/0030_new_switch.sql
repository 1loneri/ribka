CREATE TABLE `giveaway_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`image_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`digest` text NOT NULL,
	`created` integer NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `giveaway_feedback_recent` ON `giveaway_feedback` (`deleted`,`created`,`id`);