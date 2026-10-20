CREATE TABLE `level_message_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`observed` integer NOT NULL,
	`total` integer NOT NULL,
	`nonce` text NOT NULL,
	`created` integer NOT NULL
);
