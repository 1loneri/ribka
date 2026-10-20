ALTER TABLE `entries` ADD `hue` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `brightness` integer;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `draw_mode` text DEFAULT 'case' NOT NULL;