import express from "express";
import cors from "cors";
import db from "./database.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const PORT = 4000;
const JWT_SECRET = "cambiar-por-una-clave-segura";

app.use(cors());
app.use(express.json());
const ALLOWED_MEALS = [
  "Desayuno",
  "Almuerzo",
  "Merienda",
  "Cena",
  "Colación Mañana",
  "Colación Tarde",
  "Colación Noche"
];

function parseCategories(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

function calculateCalories(product, quantity) {
  const qty = Number(quantity);

  if (product.measure_type === "Gramos") {
    return (qty * Number(product.reference_calories)) / Number(product.reference_value);
  }

  return qty * Number(product.reference_calories);
}

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Faltan datos obligatorios." });
  }

  const existingUser = db.prepare(`
    SELECT id FROM users WHERE email = ?
  `).get(email.trim().toLowerCase());

  if (existingUser) {
    return res.status(400).json({ error: "Ese email ya está registrado." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `).run(
    name.trim(),
    email.trim().toLowerCase(),
    passwordHash
  );

  const user = db.prepare(`
    SELECT id, name, email FROM users WHERE id = ?
  `).get(result.lastInsertRowid);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(201).json({ user, token });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña son obligatorios." });
  }

  const user = db.prepare(`
    SELECT * FROM users WHERE email = ?
  `).get(email.trim().toLowerCase());

  if (!user) {
    return res.status(401).json({ error: "Credenciales inválidas." });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);

  if (!passwordOk) {
    return res.status(401).json({ error: "Credenciales inválidas." });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    },
    token
  });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  res.json(user);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/entries", authMiddleware, (req, res) => {
  const date = req.query.date;

  if (!date) {
    return res.status(400).json({ error: "La fecha es obligatoria." });
  }

  const rows = db.prepare(`
    SELECT
      dr.id,
      dr.user_id,
      dr.entry_date,
      dr.meal_type,
      dr.product_id,
      dr.quantity_consumed,
      dr.calculated_calories,
      p.name AS product_name,
      p.measure_type,
      p.unit_label,
      p.categories
    FROM daily_records dr
    INNER JOIN products p ON p.id = dr.product_id
    WHERE dr.entry_date = ?
      AND dr.user_id = ?
    ORDER BY dr.id DESC
  `).all(date, req.user.id);

  const entries = rows.map((row) => ({
    ...row,
    categories: parseCategories(row.categories)
  }));

  res.json(entries);
});

app.get("/api/products", (req, res) => {
  const category = req.query.category;
  const rows = db.prepare(`SELECT * FROM products ORDER BY name ASC`).all();

  const products = rows.map((row) => ({
    ...row,
    categories: parseCategories(row.categories)
  }));

  if (!category) {
    return res.json(products);
  }

  const filtered = products.filter((product) =>
    product.categories.includes(category)
  );

  res.json(filtered);
});

app.post("/api/products", (req, res) => {
  const {
    name,
    measureType,
    referenceValue,
    referenceCalories,
    weightPerUnit,
    unitLabel,
    categories
  } = req.body;

  if (!name || !measureType || !referenceValue || !referenceCalories) {
    return res.status(400).json({ error: "Faltan campos obligatorios del producto." });
  }

  if (!["Gramos", "Unidad"].includes(measureType)) {
    return res.status(400).json({ error: "Tipo de medida inválido." });
  }

  const cleanCategories = Array.isArray(categories)
    ? categories.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const result = db.prepare(`
    INSERT INTO products (
      name,
      measure_type,
      reference_value,
      reference_calories,
      weight_per_unit,
      unit_label,
      categories
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    measureType,
    Number(referenceValue),
    Number(referenceCalories),
    weightPerUnit ? Number(weightPerUnit) : null,
    unitLabel?.trim() || (measureType === "Gramos" ? "g" : "unidad"),
    JSON.stringify(cleanCategories)
  );
  const created = db.prepare(`SELECT * FROM products WHERE id = ?`).get(result.lastInsertRowid);

  res.status(201).json({
    ...created,
    categories: parseCategories(created.categories)
  });
});

app.put("/api/products/:id", (req, res) => {
  const productId = Number(req.params.id);
  const {
    name,
    measureType,
    referenceValue,
    referenceCalories,
    weightPerUnit,
    unitLabel,
    categories
  } = req.body;

  const existing = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);
  if (!existing) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  if (!name || !measureType || !referenceValue || !referenceCalories) {
    return res.status(400).json({ error: "Faltan campos obligatorios del producto." });
  }

  const cleanCategories = Array.isArray(categories)
    ? categories.map((item) => String(item).trim()).filter(Boolean)
    : [];

  db.prepare(`
    UPDATE products
    SET name = ?,
        measure_type = ?,
        reference_value = ?,
        reference_calories = ?,
        weight_per_unit = ?,
        unit_label = ?,
        categories = ?
    WHERE id = ?
  `).run(
    name.trim(),
    measureType,
    Number(referenceValue),
    Number(referenceCalories),
    weightPerUnit ? Number(weightPerUnit) : null,
    unitLabel?.trim() || (measureType === "Gramos" ? "g" : "unidad"),
    JSON.stringify(cleanCategories),
    productId
  );

  const updated = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);

  res.json({
    ...updated,
    categories: parseCategories(updated.categories)
  });
});

app.delete("/api/products/:id", (req, res) => {
  const productId = Number(req.params.id);

  const existing = db.prepare(`SELECT * FROM products WHERE id = ?`).get(productId);
  if (!existing) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const usedInRecords = db.prepare(`
    SELECT COUNT(*) as total
    FROM daily_records
    WHERE product_id = ?
  `).get(productId);

  if (usedInRecords.total > 0) {
    return res.status(400).json({
      error: "No se puede eliminar el producto porque ya tiene registros asociados."
    });
  }

  db.prepare(`DELETE FROM products WHERE id = ?`).run(productId);
  res.json({ ok: true });
});


app.post("/api/entries", authMiddleware, (req, res) => {
  const {
    date,
    mealType,
    productId,
    quantityConsumed
  } = req.body;

  if (!date || !mealType || !productId || !quantityConsumed) {
    return res.status(400).json({ error: "Faltan campos obligatorios del registro." });
  }

  if (!ALLOWED_MEALS.includes(mealType)) {
    return res.status(400).json({ error: "Tipo de comida inválido." });
  }

  const product = db.prepare(`
    SELECT * FROM products WHERE id = ?
  `).get(productId);

  if (!product) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const calculatedCalories = Number(
    calculateCalories(product, quantityConsumed).toFixed(2)
  );

  const result = db.prepare(`
    INSERT INTO daily_records (
      user_id,
      entry_date,
      meal_type,
      product_id,
      quantity_consumed,
      calculated_calories
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    date,
    mealType,
    Number(productId),
    Number(quantityConsumed),
    calculatedCalories
  );

  const created = db.prepare(`
    SELECT * FROM daily_records WHERE id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(created);
});

app.put("/api/entries/:id", authMiddleware, (req, res) => {
  const entryId = Number(req.params.id);
  const { date, mealType, productId, quantityConsumed } = req.body;

  const existing = db.prepare(`
    SELECT * FROM daily_records WHERE id = ? AND user_id = ?
  `).get(entryId, req.user.id);

  if (!existing) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  if (!date || !mealType || !productId || !quantityConsumed) {
    return res.status(400).json({ error: "Faltan campos obligatorios del registro." });
  }

  if (!ALLOWED_MEALS.includes(mealType)) {
    return res.status(400).json({ error: "Tipo de comida inválido." });
  }

  const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(Number(productId));
  if (!product) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const calculatedCalories = Number(calculateCalories(product, quantityConsumed).toFixed(2));

  db.prepare(`
    UPDATE daily_records
    SET entry_date = ?,
        meal_type = ?,
        product_id = ?,
        quantity_consumed = ?,
        calculated_calories = ?
    WHERE id = ? AND user_id = ?
  `).run(
    date,
    mealType,
    Number(productId),
    Number(quantityConsumed),
    calculatedCalories,
    entryId,
    req.user.id
  );

  const updated = db.prepare(`
    SELECT * FROM daily_records WHERE id = ? AND user_id = ?
  `).get(entryId, req.user.id);

  res.json(updated);
});

app.delete("/api/entries/:id", authMiddleware, (req, res) => {
  const entryId = Number(req.params.id);

  const existing = db.prepare(`
    SELECT * FROM daily_records WHERE id = ? AND user_id = ?
  `).get(entryId, req.user.id);

  if (!existing) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  db.prepare(`DELETE FROM daily_records WHERE id = ? AND user_id = ?`).run(entryId, req.user.id);
  res.json({ ok: true });
});

app.get("/api/summary", authMiddleware, (req, res) => {
  const date = req.query.date;

  if (!date) {
    return res.status(400).json({ error: "La fecha es obligatoria." });
  }

  const total = db.prepare(`
    SELECT
      COALESCE(SUM(calculated_calories), 0) as totalCalories,
      COUNT(*) as totalEntries
    FROM daily_records
    WHERE entry_date = ?
      AND user_id = ?
  `).get(date, req.user.id);

  res.json(total);
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});