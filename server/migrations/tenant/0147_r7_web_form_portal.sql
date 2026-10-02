-- Existing published forms gain no new portal privileges until configured explicitly.
ALTER TABLE web_forms ADD COLUMN allow_edit INTEGER NOT NULL DEFAULT 0 CHECK (allow_edit IN (0,1));
ALTER TABLE web_forms ADD COLUMN allow_delete INTEGER NOT NULL DEFAULT 0 CHECK (allow_delete IN (0,1));
ALTER TABLE web_forms ADD COLUMN allow_multiple INTEGER NOT NULL DEFAULT 0 CHECK (allow_multiple IN (0,1));
ALTER TABLE web_forms ADD COLUMN show_list INTEGER NOT NULL DEFAULT 0 CHECK (show_list IN (0,1));
