import { pgTable, uuid, varchar, text, boolean, timestamp, date, integer, unique, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const user_streaks = pgTable('user_streaks', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  current_streak: integer('current_streak').notNull().default(0),
  longest_streak: integer('longest_streak').notNull().default(0),
  last_login_date: date('last_login_date'),  // DATE in IST, no time component
  today_counted: boolean('today_counted').notNull().default(false),
}, (table) => [
  index('user_streaks_user_id_idx').on(table.user_id),
]);

export const saved_articles = pgTable('saved_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  article_stable_id: varchar('article_stable_id', { length: 32 }).notNull(),
  article_link: text('article_link').notNull(),
  article_title: text('article_title').notNull(),
  article_source: varchar('article_source', { length: 255 }),
  article_image_url: text('article_image_url'),
  article_summary: text('article_summary'),
  article_category: varchar('article_category', { length: 32 }),
  article_pub_date: timestamp('article_pub_date', { withTimezone: true }),
  saved_at: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('saved_articles_user_article_unique').on(table.user_id, table.article_stable_id),
  index('saved_articles_user_id_idx').on(table.user_id),
  index('saved_articles_stable_id_idx').on(table.article_stable_id),
]);

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 50 }),
  name_provided: varchar('name_provided', { length: 100 }),
  message: text('message').notNull(),
  ip_hash: varchar('ip_hash', { length: 64 }),
  content_hash: varchar('content_hash', { length: 64 }),
  // Delivery tracking fields
  email_sent: boolean('email_sent').notNull().default(false),
  delivery_status: varchar('delivery_status', { length: 20 }).notNull().default('pending'),
  // Valid values: 'pending' | 'retrying' | 'sent' | 'failed' | 'permanently_failed'
  resend_message_id: varchar('resend_message_id', { length: 255 }),
  delivery_error: text('delivery_error'),           // most recent error message, if any
  delivery_attempted_at: timestamp('delivery_attempted_at', { withTimezone: true }),
  claim_started_at: timestamp('claim_started_at', { withTimezone: true }), // worker claim start time for stale-claim recovery
  retry_count: integer('retry_count').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('feedback_ip_hash_idx').on(table.ip_hash),
  index('feedback_content_hash_idx').on(table.content_hash),
  index('feedback_delivery_status_idx').on(table.delivery_status),
  index('feedback_claim_started_at_idx').on(table.claim_started_at),
]);

export const feedback_rate_limit = pgTable('feedback_rate_limit', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip_hash: varchar('ip_hash', { length: 64 }).notNull().unique(),
  submission_count: integer('submission_count').notNull().default(1),
  window_start: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
});

export const registration_rate_limit = pgTable('registration_rate_limit', {
  id: uuid('id').primaryKey().defaultRandom(),
  ip_hash: varchar('ip_hash', { length: 64 }).notNull().unique(),
  registration_count: integer('registration_count').notNull().default(1),
  window_start: timestamp('window_start', { withTimezone: true }).defaultNow().notNull(),
});
