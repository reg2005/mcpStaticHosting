CREATE TABLE "instance_state" (
	"id" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "system_domain_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" DROP COLUMN "verification_token";
--> statement-breakpoint
UPDATE "domains" SET "hostname" = 'preview--' || replace("hostname", '.preview.', '.') WHERE "type" = 'subdomain' AND "is_preview" = true;
--> statement-breakpoint
UPDATE "domains" SET "verified" = false, "tls" = 'pending' WHERE "type" = 'custom';
