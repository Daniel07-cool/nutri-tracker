import { useEffect, useMemo, useState } from "react";

const API_URL = "https://nutri-tracker.onrender.com/api";

const MEAL_TYPES = [
  "Desayuno",
  "Almuerzo",
  "Merienda",
  "Cena",
  "Colación Mañana",
  "Colación Tarde",
  "Colación Noche"
];
const CATEGORY_OPTIONS = [
  "Proteína",
  "Carbohidrato",
  "Fibra",
  "Grasas",
  "Fruta",
  "Lácteo"
];



  

  


function getToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split("T")[0];
}
function formatNumber(value) {
  return new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ totalCalories: 0, totalEntries: 0 });
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [filterCategory, setFilterCategory] = useState("");
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(
    JSON.parse(localStorage.getItem("currentUser") || "null")
  );
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: ""
  });
  const emptyProductForm = {
    name: "",
    measureType: "Gramos",
    referenceValue: 100,
    referenceCalories: "",
    weightPerUnit: "",
    unitLabel: "g",
    categories: []
  };

  const emptyEntryForm = {
    date: getToday(),
    mealType: "Desayuno",
    productId: "",
    quantityConsumed: ""
  };

  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState(null);

  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [editingEntryId, setEditingEntryId] = useState(null);

  
  function getAuthHeaders() {
    return token
      ? {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
      : {
        "Content-Type": "application/json"
      };
  }

  async function handleRegister(event) {
    event.preventDefault();

    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authForm)
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "No se pudo registrar el usuario.");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("currentUser", JSON.stringify(data.user));
    setToken(data.token);
    setCurrentUser(data.user);
  }

  async function handleLogin(event) {
    event.preventDefault();

    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: authForm.email,
        password: authForm.password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "No se pudo iniciar sesión.");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("currentUser", JSON.stringify(data.user));
    setToken(data.token);
    setCurrentUser(data.user);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("currentUser");
    setToken("");
    setCurrentUser(null);
    setEntries([]);
    setSummary({ totalCalories: 0, totalEntries: 0 });
  }



  async function fetchProducts(category = "") {
    const url = category
      ? `${API_URL}/products?category=${encodeURIComponent(category)}`
      : `${API_URL}/products`;

    const response = await fetch(url);
    const data = await response.json();
    setProducts(data);
  }

  async function fetchEntries(date) {
    if (!token) return;

    const response = await fetch(`${API_URL}/entries?date=${date}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      setEntries(data);
    }
  }

  async function fetchSummary(date) {
    if (!token) return;

    const response = await fetch(`${API_URL}/summary?date=${date}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (response.ok) {
      setSummary(data);
    }
  }

  useEffect(() => {
    fetchProducts(filterCategory);
  }, [filterCategory]);

  useEffect(() => {
    fetchEntries(selectedDate);
    fetchSummary(selectedDate);
    setEntryForm((prev) => ({ ...prev, date: selectedDate }));
  }, [selectedDate]);

  useEffect(() => {
    if (products.length > 0 && !entryForm.productId) {
      setEntryForm((prev) => ({ ...prev, productId: String(products[0].id) }));
    }
  }, [products, entryForm.productId]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => String(product.id) === String(entryForm.productId));
  }, [products, entryForm.productId]);

  const previewCalories = useMemo(() => {
    if (!selectedProduct || !entryForm.quantityConsumed) return 0;

    const qty = Number(entryForm.quantityConsumed);
    if (selectedProduct.measure_type === "Gramos") {
      return (qty * Number(selectedProduct.reference_calories)) / Number(selectedProduct.reference_value);
    }
    return qty * Number(selectedProduct.reference_calories);
  }, [selectedProduct, entryForm.quantityConsumed]);

  function updateProductField(field, value) {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEntryField(field, value) {
    setEntryForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleCategory(category) {
    setProductForm((prev) => {
      const exists = prev.categories.includes(category);
      return {
        ...prev,
        categories: exists
          ? prev.categories.filter((item) => item !== category)
          : [...prev.categories, category]
      };
    });
  }



  async function handleSaveProduct(event) {
    event.preventDefault();

    const payload = {
      ...productForm,
      unitLabel: productForm.measureType === "Gramos"
        ? "g"
        : productForm.unitLabel || "unidad"
    };

    const isEditing = Boolean(editingProductId);
    const url = isEditing
      ? `${API_URL}/products/${editingProductId}`
      : `${API_URL}/products`;

    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "No se pudo guardar el producto.");
      return;
    }

    await fetchProducts(filterCategory);
    setProductForm(emptyProductForm);
    setEditingProductId(null);
  }

  function handleEditProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      measureType: product.measure_type,
      referenceValue: product.reference_value,
      referenceCalories: product.reference_calories,
      weightPerUnit: product.weight_per_unit || "",
      unitLabel: product.unit_label || (product.measure_type === "Gramos" ? "g" : "unidad"),
      categories: product.categories || []
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteProduct(productId) {
    const confirmed = window.confirm("¿Eliminar este producto?");
    if (!confirmed) return;

    const response = await fetch(`${API_URL}/products/${productId}`, {
      method: "DELETE"
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "No se pudo eliminar el producto.");
      return;
    }

    if (editingProductId === productId) {
      setEditingProductId(null);
      setProductForm(emptyProductForm);
    }

    await fetchProducts(filterCategory);
  }

  function handleCancelProductEdit() {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
  }

  async function handleSaveEntry(event) {
    event.preventDefault();

    const payload = {
      date: entryForm.date,
      mealType: entryForm.mealType,
      productId: Number(entryForm.productId),
      quantityConsumed: Number(entryForm.quantityConsumed)
    };

    const isEditing = Boolean(editingEntryId);
    const url = isEditing
      ? `${API_URL}/entries/${editingEntryId}`
      : `${API_URL}/entries`;

    const response = await fetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "No se pudo guardar el registro.");
      return;
    }

    await fetchEntries(selectedDate);
    await fetchSummary(selectedDate);

    setEntryForm({
      ...emptyEntryForm,
      date: selectedDate,
      productId: products[0] ? String(products[0].id) : ""
    });
    setEditingEntryId(null);
  }

  function handleEditEntry(entry) {
    setEditingEntryId(entry.id);
    setEntryForm({
      date: entry.entry_date,
      mealType: entry.meal_type,
      productId: String(entry.product_id),
      quantityConsumed: entry.quantity_consumed
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteEntry(entryId) {
    const confirmed = window.confirm("¿Eliminar este registro?");
    if (!confirmed) return;

    const response = await fetch(`${API_URL}/entries/${entryId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.error || "No se pudo eliminar el registro.");
      return;
    }

    if (editingEntryId === entryId) {
      setEditingEntryId(null);
      setEntryForm({
        ...emptyEntryForm,
        date: selectedDate,
        productId: products[0] ? String(products[0].id) : ""
      });
    }

    await fetchEntries(selectedDate);
    await fetchSummary(selectedDate);
  }

  function handleCancelEntryEdit() {
    setEditingEntryId(null);
    setEntryForm({
      ...emptyEntryForm,
      date: selectedDate,
      productId: products[0] ? String(products[0].id) : ""
    });
  }

  if (!currentUser) {
    return (
      <div className="page">
        <section className="card" style={{ maxWidth: 480, margin: "40px auto" }}>
          <h1>{authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h1>

          <form onSubmit={authMode === "login" ? handleLogin : handleRegister} className="form-grid">

            {authMode === "register" && (
              <label className="full">
                <span>Nombre</span>
                <input
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                />
              </label>
            )}

            <label className="full">
              <span>Email</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </label>

            <label className="full">
              <span>Contraseña</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm((prev) => ({ ...prev, password: e.target.value }))
                }
                required
              />
            </label>

            <button className="primary full" type="submit">
              {authMode === "login" ? "Ingresar" : "Registrarme"}
            </button>
          </form>

          <p style={{ marginTop: 16 }}>
            {authMode === "login" ? "¿No tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
            <button
              type="button"
              className="chip"
              onClick={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            >
              {authMode === "login" ? "Crear cuenta" : "Iniciar sesión"}
            </button>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>Plan Nutricional</h1>
        <p>Control diario de calorías y alimentación saludable</p>
        <div style={{ marginTop: 12 }}>
          <strong>Usuario:</strong> {currentUser.name} ({currentUser.email})
          <button
            type="button"
            className="chip"
            onClick={handleLogout}
            style={{ marginLeft: 12 }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="summary-grid">
        <div className="summary-card">
          <span>Total del día</span>
          <strong>{formatNumber(summary.totalCalories)} kcal</strong>
        </div>
        <div className="summary-card">
          <span>Registros</span>
          <strong>{summary.totalEntries}</strong>
        </div>
        <div className="summary-card">
          <span>Fecha activa</span>
          <strong>{selectedDate}</strong>
        </div>
      </section>

      <div className="layout">
        <section className="card">
          <h2>Nuevo producto</h2>
          <form onSubmit={handleSaveProduct} className="form-grid">
            <label className="full">
              <span>Nombre</span>
              <input
                value={productForm.name}
                onChange={(e) => updateProductField("name", e.target.value)}
                placeholder="Ej: Pan integral"
                required
              />
            </label>

            <label>
              <span>Tipo de medida</span>
              <select
                value={productForm.measureType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setProductForm((prev) => ({
                    ...prev,
                    measureType: nextType,
                    referenceValue: nextType === "Gramos" ? 100 : 1,
                    unitLabel: nextType === "Gramos" ? "g" : "unidad"
                  }));
                }}
              >
                <option value="Gramos">Gramos</option>
                <option value="Unidad">Unidad</option>
              </select>
            </label>

            <label>
              <span>Valor referencia</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productForm.referenceValue}
                onChange={(e) => updateProductField("referenceValue", e.target.value)}
                required
              />
            </label>

            <label>
              <span>Calorías por referencia</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productForm.referenceCalories}
                onChange={(e) => updateProductField("referenceCalories", e.target.value)}
                required
              />
            </label>

            <label>
              <span>Nombre de unidad</span>
              <input
                value={productForm.unitLabel}
                onChange={(e) => updateProductField("unitLabel", e.target.value)}
                placeholder="Ej: vaso, fruta, rebanada"
                disabled={productForm.measureType === "Gramos"}
              />
            </label>

            <label className="full">
              <span>Peso por unidad (opcional, gramos)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productForm.weightPerUnit}
                onChange={(e) => updateProductField("weightPerUnit", e.target.value)}
                placeholder="Ej: 180"
              />
            </label>

            <div className="full category-block">
              <span className="label-title">Clasificación del producto</span>
              <div className="chips">
                {CATEGORY_OPTIONS.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={productForm.categories.includes(category) ? "chip active" : "chip"}
                    onClick={() => toggleCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="full" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="primary" type="submit">
                {editingProductId ? "Actualizar producto" : "Guardar producto"}
              </button>

              {editingProductId && (
                <button type="button" className="chip" onClick={handleCancelProductEdit}>
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card">
          <h2>Registrar comida</h2>
          <form onSubmit={handleSaveEntry} className="form-grid">
            <label>
              <span>Fecha</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>

            <label>
              <span>Tipo de comida</span>
              <select
                value={entryForm.mealType}
                onChange={(e) => updateEntryField("mealType", e.target.value)}
              >
                {MEAL_TYPES.map((meal) => (
                  <option key={meal} value={meal}>{meal}</option>
                ))}
              </select>
            </label>

            <label className="full">
              <span>Producto</span>
              <select
                value={entryForm.productId}
                onChange={(e) => updateEntryField("productId", e.target.value)}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Cantidad consumida</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={entryForm.quantityConsumed}
                onChange={(e) => updateEntryField("quantityConsumed", e.target.value)}
                placeholder="Ej: 200 o 2"
                required
              />
            </label>

            <div className="preview-box">
              <span>Calorías calculadas</span>
              <strong>{formatNumber(previewCalories)} kcal</strong>
              <small>
                {selectedProduct?.measure_type === "Gramos"
                  ? `Fórmula: (cantidad × ${selectedProduct?.reference_calories}) / ${selectedProduct?.reference_value}g`
                  : `Fórmula: cantidad × ${selectedProduct?.reference_calories}`}
              </small>
            </div>

            <div className="full" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="primary" type="submit">
                {editingEntryId ? "Actualizar registro" : "Guardar registro"}
              </button>

              {editingEntryId && (
                <button type="button" className="chip" onClick={handleCancelEntryEdit}>
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      <section className="card">
        <div className="toolbar">
          <div>
            <h2>Productos</h2>
            <p>Filtra por clasificación nutricional o por momento de consumo.</p>
          </div>

          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Medida</th>
                <th>Referencia</th>
                <th>Calorías</th>
                <th>Categorías</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.measure_type}</td>
                  <td>
                    {product.measure_type === "Gramos"
                      ? `${formatNumber(product.reference_value)} g`
                      : `${formatNumber(product.reference_value)} ${product.unit_label}`}
                  </td>
                  <td>{formatNumber(product.reference_calories)} kcal</td>
                  <td>
                    <div className="badge-wrap">
                      {product.categories.map((category) => (
                        <span key={category} className="badge">{category}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="chip" onClick={() => handleEditProduct(product)}>
                        Editar
                      </button>
                      <button type="button" className="chip-danger" onClick={() => handleDeleteProduct(product.id)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Registros del día</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Comida</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Categorías</th>
                <th>Calorías</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.meal_type}</td>
                  <td>{entry.product_name}</td>
                  <td>
                    {entry.measure_type === "Gramos"
                      ? `${formatNumber(entry.quantity_consumed)} g`
                      : `${formatNumber(entry.quantity_consumed)} ${entry.unit_label}`}
                  </td>
                  <td>
                    <div className="badge-wrap">
                      {entry.categories.map((category) => (
                        <span key={category} className="badge">{category}</span>
                      ))}
                    </div>
                  </td>
                  <td>{formatNumber(entry.calculated_calories)} kcal</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="chip" onClick={() => handleEditEntry(entry)}>
                        Editar
                      </button>
                      <button type="button" className="chip" onClick={() => handleDeleteEntry(entry.id)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


