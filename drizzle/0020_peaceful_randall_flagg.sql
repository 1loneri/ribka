ALTER TABLE `fishing_duels` ADD `transferred_fish` text;--> statement-breakpoint
UPDATE fishing_duels SET status='cancelled' WHERE status='pending';
--> statement-breakpoint
DELETE FROM fishing_duel_locks WHERE duel IN (SELECT id FROM fishing_duels WHERE status='cancelled');
