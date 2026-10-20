CREATE TABLE `demo_profiles` (
	`twitch_id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`avatar` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `demo_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`twitch_id` text NOT NULL,
	`twitch_name` text NOT NULL,
	`avatar` text,
	`riot_id` text NOT NULL,
	`rank` text NOT NULL,
	`rank_verified_by` text,
	`rank_verified_at` integer,
	`question` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`video_key` text,
	`video_size` integer,
	`duration_ms` integer,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_reviews_request` ON `demo_reviews` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `demo_reviews_queue` ON `demo_reviews` (`status`,`created`,`id`);--> statement-breakpoint
CREATE INDEX `demo_reviews_owner` ON `demo_reviews` (`owner`,`created`);