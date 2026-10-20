CREATE TABLE `entries` (
	`giveaway` text NOT NULL,
	`user` text NOT NULL,
	`name` text NOT NULL,
	`created` integer NOT NULL,
	`winner` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`giveaway`, `user`)
);
--> statement-breakpoint
CREATE TABLE `giveaways` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`host` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`prize` text NOT NULL,
	`slots` integer NOT NULL,
	`ends` integer NOT NULL,
	`created` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
