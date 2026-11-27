CREATE TABLE "plantillas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo_documento" text DEFAULT 'factura' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"fiscal" boolean DEFAULT true NOT NULL,
	"campos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"columnas" jsonb,
	"reglas" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creada_por" text NOT NULL,
	"compartida" boolean DEFAULT true NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "plantillas_creada_por_idx" ON "plantillas" USING btree ("creada_por");