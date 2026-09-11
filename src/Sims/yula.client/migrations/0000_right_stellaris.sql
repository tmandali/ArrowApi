CREATE TABLE "app_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"role" text DEFAULT 'Viewer',
	"status" text DEFAULT 'Active',
	"last_active" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY DEFAULT 'local' NOT NULL,
	"email" text,
	"full_name" text,
	"language" text DEFAULT 'tr',
	"time_zone" text DEFAULT 'Europe/Istanbul',
	"ai_provider" text,
	"ai_model" text,
	"ai_endpoint" text,
	"thinking_level" text DEFAULT 'low',
	"system_facts" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
