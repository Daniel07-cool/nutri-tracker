import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { initDb } from "./initDb.js";

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("Falta la variable de entorno JWT_SECRET");
}

app.use(cors({
  origin: "https://nutri-tracker-fht4.vercel.app"
}));


app.use(express.json());
await initDb();
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

  const existingUser = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );

  if (existingUser.rows.length > 0) {
    return res.status(400).json({ error: "Ese email ya está registrado." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email`,
    [name.trim(), email.trim().toLowerCase(), passwordHash]
  );

  const user = result.rows[0];

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

  const result = await pool.query(
    `SELECT * FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );

  const user = result.rows[0];

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

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, email FROM users WHERE id = $1`,
    [req.user.id]
  );

  const user = result.rows[0];

  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  res.json(user);
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/entries", authMiddleware, async (req, res) => {
  const date = req.query.date;

  if (!date) {
    return res.status(400).json({ error: "La fecha es obligatoria." });
  }

  const result = await pool.query(
    `SELECT
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
    WHERE dr.entry_date = $1
      AND dr.user_id = $2
    ORDER BY dr.id DESC`,
    [date, req.user.id]
  );

  const entries = result.rows.map((row) => ({
    ...row,
    categories: parseCategories(row.categories)
  }));

  res.json(entries);
});

app.get("/api/products", async (req, res) => {
  const category = req.query.category;
  const result = await pool.query(`SELECT * FROM products ORDER BY name ASC`);

  const products = result.rows.map((row) => ({
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

app.post("/api/products", async (req, res) => {
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

  const result = await pool.query(
    `INSERT INTO products (
      name,
      measure_type,
      reference_value,
      reference_calories,
      weight_per_unit,
      unit_label,
      categories
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      name.trim(),
      measureType,
      Number(referenceValue),
      Number(referenceCalories),
      weightPerUnit ? Number(weightPerUnit) : null,
      unitLabel?.trim() || (measureType === "Gramos" ? "g" : "unidad"),
      JSON.stringify(cleanCategories)
    ]
  );

  const created = result.rows[0];

  res.status(201).json({
    ...created,
    categories: parseCategories(created.categories)
  });
});

app.put("/api/products/:id", async (req, res) => {
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

  const existingResult = await pool.query(
    `SELECT * FROM products WHERE id = $1`,
    [productId]
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  if (!name || !measureType || !referenceValue || !referenceCalories) {
    return res.status(400).json({ error: "Faltan campos obligatorios del producto." });
  }

  const cleanCategories = Array.isArray(categories)
    ? categories.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const result = await pool.query(
    `UPDATE products
     SET name = $1,
         measure_type = $2,
         reference_value = $3,
         reference_calories = $4,
         weight_per_unit = $5,
         unit_label = $6,
         categories = $7
     WHERE id = $8
     RETURNING *`,
    [
      name.trim(),
      measureType,
      Number(referenceValue),
      Number(referenceCalories),
      weightPerUnit ? Number(weightPerUnit) : null,
      unitLabel?.trim() || (measureType === "Gramos" ? "g" : "unidad"),
      JSON.stringify(cleanCategories),
      productId
    ]
  );

  const updated = result.rows[0];

  res.json({
    ...updated,
    categories: parseCategories(updated.categories)
  });
});

app.delete("/api/products/:id", async (req, res) => {
  const productId = Number(req.params.id);

  const existingResult = await pool.query(
    `SELECT * FROM products WHERE id = $1`,
    [productId]
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const usedInRecordsResult = await pool.query(
    `SELECT COUNT(*)::int as total
     FROM daily_records
     WHERE product_id = $1`,
    [productId]
  );

  if (usedInRecordsResult.rows[0].total > 0) {
    return res.status(400).json({
      error: "No se puede eliminar el producto porque ya tiene registros asociados."
    });
  }

  await pool.query(`DELETE FROM products WHERE id = $1`, [productId]);
  res.json({ ok: true });
});


app.post("/api/entries", authMiddleware, async (req, res) => {
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

  const productResult = await pool.query(
    `SELECT * FROM products WHERE id = $1`,
    [productId]
  );
  const product = productResult.rows[0];

  if (!product) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const calculatedCalories = Number(
    calculateCalories(product, quantityConsumed).toFixed(2)
  );

  const result = await pool.query(
    `INSERT INTO daily_records (
      user_id,
      entry_date,
      meal_type,
      product_id,
      quantity_consumed,
      calculated_calories
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      req.user.id,
      date,
      mealType,
      Number(productId),
      Number(quantityConsumed),
      calculatedCalories
    ]
  );

  const created = result.rows[0];
  res.status(201).json(created);
});

app.put("/api/entries/:id", authMiddleware, async (req, res) => {
  const entryId = Number(req.params.id);
  const { date, mealType, productId, quantityConsumed } = req.body;

  const existingResult = await pool.query(
    `SELECT * FROM daily_records WHERE id = $1 AND user_id = $2`,
    [entryId, req.user.id]
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  if (!date || !mealType || !productId || !quantityConsumed) {
    return res.status(400).json({ error: "Faltan campos obligatorios del registro." });
  }

  if (!ALLOWED_MEALS.includes(mealType)) {
    return res.status(400).json({ error: "Tipo de comida inválido." });
  }

  const productResult = await pool.query(
    `SELECT * FROM products WHERE id = $1`,
    [Number(productId)]
  );
  const product = productResult.rows[0];

  if (!product) {
    return res.status(404).json({ error: "Producto no encontrado." });
  }

  const calculatedCalories = Number(
    calculateCalories(product, quantityConsumed).toFixed(2)
  );

  const result = await pool.query(
    `UPDATE daily_records
     SET entry_date = $1,
         meal_type = $2,
         product_id = $3,
         quantity_consumed = $4,
         calculated_calories = $5
     WHERE id = $6 AND user_id = $7
     RETURNING *`,
    [
      date,
      mealType,
      Number(productId),
      Number(quantityConsumed),
      calculatedCalories,
      entryId,
      req.user.id
    ]
  );

  const updated = result.rows[0];
  res.json(updated);
});

app.delete("/api/entries/:id", authMiddleware, async (req, res) => {
  const entryId = Number(req.params.id);

  const existingResult = await pool.query(
    `SELECT * FROM daily_records WHERE id = $1 AND user_id = $2`,
    [entryId, req.user.id]
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  await pool.query(
    `DELETE FROM daily_records WHERE id = $1 AND user_id = $2`,
    [entryId, req.user.id]
  );

  res.json({ ok: true });
});

app.get("/api/summary", authMiddleware, async (req, res) => {
  const date = req.query.date;

  if (!date) {
    return res.status(400).json({ error: "La fecha es obligatoria." });
  }

  const result = await pool.query(
    `SELECT
      COALESCE(SUM(calculated_calories), 0) as "totalCalories",
      COUNT(*)::int as "totalEntries"
     FROM daily_records
     WHERE entry_date = $1
       AND user_id = $2`,
    [date, req.user.id]
  );

  res.json(result.rows[0]);
});



app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend escuchando en puerto ${PORT}`);
});