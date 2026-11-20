-- Called inside the bootstrap transaction, after confirming a unique roster match for every row.
CREATE FUNCTION pg_temp.member_uuid(old_id integer) RETURNS uuid LANGUAGE sql STABLE STRICT AS
'SELECT member_id FROM pg_temp.account_map WHERE old_user_id = old_id';

ALTER TABLE posts DROP CONSTRAINT posts_author_id_users_id_fk;
ALTER TABLE comments DROP CONSTRAINT comments_author_id_users_id_fk;
ALTER TABLE payments DROP CONSTRAINT payments_user_id_users_id_fk;
ALTER TABLE alumni_database DROP CONSTRAINT alumni_database_matched_user_id_users_id_fk;
ALTER TABLE event_parse_rate_limits DROP CONSTRAINT event_parse_rate_limits_user_id_users_id_fk;

ALTER TABLE users ALTER COLUMN id DROP DEFAULT, ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN id TYPE uuid USING pg_temp.member_uuid(id);
ALTER TABLE posts ALTER COLUMN author_id TYPE uuid USING pg_temp.member_uuid(author_id);
ALTER TABLE comments ALTER COLUMN author_id TYPE uuid USING pg_temp.member_uuid(author_id);
ALTER TABLE payments ALTER COLUMN user_id TYPE uuid USING pg_temp.member_uuid(user_id);
ALTER TABLE alumni_database ALTER COLUMN matched_user_id TYPE uuid USING pg_temp.member_uuid(matched_user_id);
ALTER TABLE event_parse_rate_limits ALTER COLUMN user_id TYPE uuid USING pg_temp.member_uuid(user_id);
DROP SEQUENCE IF EXISTS users_id_seq;

ALTER TABLE posts ADD CONSTRAINT posts_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE comments ADD CONSTRAINT comments_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE payments ADD CONSTRAINT payments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE alumni_database ADD CONSTRAINT alumni_database_matched_user_id_users_id_fk FOREIGN KEY (matched_user_id) REFERENCES users(id),
  ADD CONSTRAINT alumni_database_matched_user_id_unique UNIQUE (matched_user_id);
ALTER TABLE event_parse_rate_limits ADD CONSTRAINT event_parse_rate_limits_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
DELETE FROM "session" WHERE sess ->> 'userId' IS NOT NULL;
