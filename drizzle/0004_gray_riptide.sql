CREATE TABLE `integration_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`updated` integer NOT NULL
);
