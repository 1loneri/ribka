CREATE TABLE `level_profiles` (
	`twitch_id` text PRIMARY KEY NOT NULL,
	`login` text NOT NULL,
	`favorites` text DEFAULT '[]' NOT NULL,
	`banner_id` text DEFAULT 'default' NOT NULL,
	`avatar_id` text DEFAULT 'twitch' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
