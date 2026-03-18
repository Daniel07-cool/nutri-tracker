import Database from "better-sqlite3";

const db = new Database("nutri_tracker.db");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    measure_type TEXT NOT NULL CHECK(measure_type IN ('Gramos', 'Unidad')),
    reference_value REAL NOT NULL,
    reference_calories REAL NOT NULL,
    weight_per_unit REAL,
    unit_label TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity_consumed REAL NOT NULL,
    calculated_calories REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

const countProducts = db.prepare(`SELECT COUNT(*) as total FROM products`).get();

if (countProducts.total === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (
      name,
      measure_type,
      reference_value,
      reference_calories,
      weight_per_unit,
      unit_label,
      categories
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertProduct.run(
    "Huevo",
    "Unidad",
    1,
    70,
    null,
    "unidad",
    JSON.stringify(["Proteína"])
  );

  insertProduct.run(
    "Manzana",
    "Unidad",
    1,
    85,
    180,
    "unidad",
    JSON.stringify(["Fibra"])
  );

  insertProduct.run(
    "Avena",
    "Gramos",
    100,
    370,
    null,
    "g",
    JSON.stringify(["Carbohidrato"])
  );


  insertProduct.run(
    "Leche descremada",
    "Unidad",
    1,
    70,
    null,
    "Taza(200ml)",
    JSON.stringify(["Proteína"])
  );
}

export default db;