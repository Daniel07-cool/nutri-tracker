import pool from "./db.js";

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      measure_type TEXT NOT NULL,
      reference_value NUMERIC NOT NULL,
      reference_calories NUMERIC NOT NULL,
      weight_per_unit NUMERIC,
      unit_label TEXT,
      categories TEXT DEFAULT '[]'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      entry_date TEXT,
      meal_type TEXT,
      product_id INTEGER REFERENCES products(id),
      quantity_consumed NUMERIC,
      calculated_calories NUMERIC
    );
  `);

  console.log("DB PostgreSQL lista");
}