import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type SharedRosterPlayer = {
  id: string;
  name: string;
  age: number;
  rating: number;
  nationality: string;
  position: string;
  number: string;
};

export type SharedPlayer = Record<string, unknown>;

export const lineupClubsTable = pgTable("lineup_clubs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo"),
  jerseyColor: text("jersey_color").notNull(),
  secondaryColor: text("secondary_color").notNull(),
  accentColor: text("accent_color").notNull(),
  numberColor: text("number_color").notNull(),
  jerseyStyle: text("jersey_style").notNull(),
  backgroundId: text("background_id").notNull(),
  category: text("category").notNull(),
  roster: jsonb("roster").$type<SharedRosterPlayer[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const lineupCompositionsTable = pgTable("lineup_compositions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  sport: text("sport").notNull(),
  formation: text("formation").notNull(),
  title: text("title").notNull(),
  players: jsonb("players").$type<SharedPlayer[]>().notNull().default([]),
  bench: jsonb("bench").$type<SharedPlayer[]>().notNull().default([]),
  jerseyColor: text("jersey_color").notNull(),
  secondaryColor: text("secondary_color").notNull(),
  accentColor: text("accent_color").notNull(),
  numberColor: text("number_color"),
  jerseyStyle: text("jersey_style").notNull(),
  backgroundId: text("background_id").notNull(),
  showBench: boolean("show_bench").notNull().default(true),
  showDetails: boolean("show_details").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLineupClubSchema = createInsertSchema(lineupClubsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertLineupCompositionSchema = createInsertSchema(lineupCompositionsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertLineupClub = z.infer<typeof insertLineupClubSchema>;
export type LineupClub = typeof lineupClubsTable.$inferSelect;
export type InsertLineupComposition = z.infer<typeof insertLineupCompositionSchema>;
export type LineupComposition = typeof lineupCompositionsTable.$inferSelect;