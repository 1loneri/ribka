CREATE TABLE `fishing_hazard_losses` (
	`id` text PRIMARY KEY NOT NULL,
	`run` text NOT NULL,
	`channel` text NOT NULL,
	`username` text NOT NULL,
	`item` text,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fishing_hazards` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`owner` text NOT NULL,
	`nonce` text NOT NULL,
	`event` text NOT NULL,
	`created` integer NOT NULL,
	`message` text DEFAULT '' NOT NULL
);
