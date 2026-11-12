CREATE TABLE monster_players (
 channel text NOT NULL,
 user_id text NOT NULL,
 login text NOT NULL,
 balance integer NOT NULL DEFAULT 0 CHECK(balance >= 0),
 last_opened integer NOT NULL DEFAULT 0,
 opens integer NOT NULL DEFAULT 0,
 wins integer NOT NULL DEFAULT 0,
 jackpots integer NOT NULL DEFAULT 0,
 PRIMARY KEY(channel,user_id)
);
CREATE INDEX monster_players_ranking ON monster_players(channel,balance);
CREATE TABLE monster_duels (
 id text PRIMARY KEY NOT NULL,
 channel text NOT NULL,
 challenger_id text NOT NULL,
 challenger_login text NOT NULL,
 opponent_id text NOT NULL,
 opponent_login text NOT NULL,
 stake integer NOT NULL CHECK(stake BETWEEN 1 AND 100000),
 status text NOT NULL DEFAULT 'pending',
 created integer NOT NULL,
 expires integer NOT NULL,
 winner_id text,
 fee integer,
 settled_at integer
);
CREATE INDEX monster_duels_pending ON monster_duels(channel,status,expires);
CREATE INDEX monster_duels_opponent ON monster_duels(channel,opponent_id,status);
