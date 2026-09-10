import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Leads capturados desde el formulario "Agenda una demo" de la landing.
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  empresa: varchar("empresa", { length: 160 }),
  email: varchar("email", { length: 180 }).notNull(),
  telefono: varchar("telefono", { length: 40 }),
  tamanoEquipo: varchar("tamano_equipo", { length: 40 }),
  mensaje: text("mensaje"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
