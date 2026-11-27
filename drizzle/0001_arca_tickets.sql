CREATE TABLE "arca_tickets" (
	"clave" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"sign" text NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
