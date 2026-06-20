-- Fix votes.score constraint: UI allows 1-10 but DB only allowed 1-5
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_score_check;
ALTER TABLE votes ADD CONSTRAINT votes_score_check CHECK (score BETWEEN 1 AND 10);
