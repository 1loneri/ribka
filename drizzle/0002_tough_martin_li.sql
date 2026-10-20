ALTER TABLE `giveaways` ADD `entry_mode` text DEFAULT 'button' NOT NULL;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `keyword` text;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `reward_title` text;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `reward_cost` integer;