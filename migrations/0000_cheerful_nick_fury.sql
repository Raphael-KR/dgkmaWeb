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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "pending_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"kakao_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"user_data" jsonb,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "alumni_database" ADD CONSTRAINT "alumni_database_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;