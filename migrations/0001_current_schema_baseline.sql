CREATE TABLE "alumni_database" (
	"id" serial PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"generation" text NOT NULL,
	"name" text NOT NULL,
	"admission_date" text,
	"graduation_date" text,
	"address" text,
	"mobile" text,
	"phone" text,
	"group" text,
	"status" text,
	"alumni_position" text,
	"memo" text,
	"is_matched" boolean DEFAULT false,
	"matched_user_id" integer,
	CONSTRAINT "alumni_database_mobile_unique" UNIQUE("mobile")
);

CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"color" text DEFAULT '#6b7280',
	"badge_variant" text DEFAULT 'secondary',
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);

CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"amount" integer NOT NULL,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"receipt_url" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "pending_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kakao_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"user_data" jsonb,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category_id" integer,
	"author_id" integer,
	"is_published" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"kakao_id" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"graduation_year" integer,
	"is_verified" boolean DEFAULT false,
	"is_admin" boolean DEFAULT false,
	"kakao_sync_enabled" boolean DEFAULT false,
	"profile_image" text,
	"phone_number" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_kakao_id_unique" UNIQUE("kakao_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

ALTER TABLE "alumni_database" ADD CONSTRAINT "alumni_database_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday_type text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_leap_month boolean;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activity_region text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[];

CREATE TABLE IF NOT EXISTS public.comments (
  id serial PRIMARY KEY, post_id integer NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id integer REFERENCES public.users(id), content text NOT NULL, created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.obituaries (
  id serial PRIMARY KEY, title text NOT NULL, deceased_name text NOT NULL, deceased_relation text NOT NULL,
  date_of_death text NOT NULL, funeral_home text DEFAULT '', jangji text DEFAULT '', bank_account text DEFAULT '',
  chief_mourner text DEFAULT '', contact_number text DEFAULT '', author_id integer REFERENCES public.users(id), created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_events (
  id serial PRIMARY KEY, legacy_obituary_id integer UNIQUE, event_type text NOT NULL, status text NOT NULL DEFAULT 'draft',
  title text, event_date text, location text, related_member_name text, contact_number text, account_info text,
  source_text text, source_urls text[] DEFAULT '{}', details jsonb NOT NULL DEFAULT '{}', author_id integer REFERENCES public.users(id),
  published_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_parse_rate_limits (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE, window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kakao_oauth_states (
  state_hash text PRIMARY KEY, session_binding_hash text NOT NULL UNIQUE, started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kakao_identity_terminations (
  identity_hash text PRIMARY KEY, terminated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.session (
  sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON public.session(expire);
