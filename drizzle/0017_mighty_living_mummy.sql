CREATE TABLE `giveaway_winners` (
	`id` text PRIMARY KEY NOT NULL,
	`giveaway` text NOT NULL,
	`owner` text NOT NULL,
	`channel` text NOT NULL,
	`title` text NOT NULL,
	`prize` text NOT NULL,
	`user` text NOT NULL,
	`name` text NOT NULL,
	`chosen_at` integer NOT NULL,
	`deadline` integer,
	`confirmed_at` integer,
	`state` text DEFAULT 'selected' NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `giveaway_winner_owner_date` ON `giveaway_winners` (`owner`,`chosen_at`);--> statement-breakpoint
CREATE INDEX `giveaway_winner_giveaway` ON `giveaway_winners` (`giveaway`);--> statement-breakpoint
ALTER TABLE `entries` ADD `excluded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `exclusion_reason` text;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `presence_required` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `exclude_repeat` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `giveaways` ADD `draw_token` text;--> statement-breakpoint
INSERT OR IGNORE INTO giveaway_winners(id,giveaway,owner,channel,title,prize,user,name,chosen_at,state)
SELECT 'legacy:'||g.id||':'||e.user,g.id,g.owner,COALESCE(g.channel,''),g.title,g.prize,e.user,e.name,MAX(g.created,g.ends),'selected'
FROM entries e JOIN giveaways g ON g.id=e.giveaway WHERE e.winner=1 AND g.status='completed';
