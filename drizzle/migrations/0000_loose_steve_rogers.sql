CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50),
	"name_provided" varchar(100),
	"message" text NOT NULL,
	"ip_hash" varchar(64),
	"content_hash" varchar(64),
	"email_sent" boolean DEFAULT false NOT NULL,
	"delivery_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"resend_message_id" varchar(255),
	"delivery_error" text,
	"delivery_attempted_at" timestamp with time zone,
	"claim_started_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"submission_count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_rate_limit_ip_hash_unique" UNIQUE("ip_hash")
);
--> statement-breakpoint
CREATE TABLE "registration_rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"registration_count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_rate_limit_ip_hash_unique" UNIQUE("ip_hash")
);
--> statement-breakpoint
CREATE TABLE "saved_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"article_stable_id" varchar(32) NOT NULL,
	"article_link" text NOT NULL,
	"article_title" text NOT NULL,
	"article_source" varchar(255),
	"article_image_url" text,
	"article_summary" text,
	"article_category" varchar(32),
	"article_pub_date" timestamp with time zone,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_articles_user_article_unique" UNIQUE("user_id","article_stable_id")
);
--> statement-breakpoint
CREATE TABLE "user_streaks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_login_date" date,
	"today_counted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_streaks_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "saved_articles" ADD CONSTRAINT "saved_articles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_ip_hash_idx" ON "feedback" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "feedback_content_hash_idx" ON "feedback" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "feedback_delivery_status_idx" ON "feedback" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "feedback_claim_started_at_idx" ON "feedback" USING btree ("claim_started_at");--> statement-breakpoint
CREATE INDEX "saved_articles_user_id_idx" ON "saved_articles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_articles_stable_id_idx" ON "saved_articles" USING btree ("article_stable_id");--> statement-breakpoint
CREATE INDEX "user_streaks_user_id_idx" ON "user_streaks" USING btree ("user_id");