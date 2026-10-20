CREATE TABLE `fishing_cat_clocks` (
	`channel` text PRIMARY KEY NOT NULL,
	`elapsed` integer DEFAULT 0 NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`live` integer DEFAULT 0 NOT NULL,
	`stream_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
