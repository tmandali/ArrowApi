CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"total_steps" integer DEFAULT 0,
	"total_duration_ms" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"parent_step_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"thought" text,
	"tool_name" text,
	"tool_input" jsonb,
	"tool_output" jsonb,
	"error_message" text,
	"transition_reason" text,
	"duration_ms" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_conversation_key" ON "agent_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_steps_run_key" ON "agent_steps" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_steps_conversation_key" ON "agent_steps" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_steps_parent_key" ON "agent_steps" USING btree ("parent_step_id");