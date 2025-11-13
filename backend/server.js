import express from "express";
import cors from "cors";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// 🧩 Conexión a la base de datos PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Crear tabla si no existe
pool.query(`
  CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nombre TEXT,
    precio TEXT,
    caducidad DATE,
    usuario TEXT,
    password TEXT,
    recomendaciones TEXT
  )
`);

// Obtener todos los clientes
app.get("/api/clientes", async (req, res) => {
  const result = await pool.query("SELECT * FROM clientes ORDER BY caducidad ASC");
  res.json(result.rows);
});

// Agregar cliente
app.post("/api/clientes", async (req, res) => {
  const { nombre, precio, caducidad, usuario, password, recomendaciones } = req.body;
  const result = await pool.query(
    "INSERT INTO clientes (nombre, precio, caducidad, usuario, password, recomendaciones) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [nombre, precio, caducidad, usuario, password, recomendaciones]
  );
  res.status(201).json(result.rows[0]);
});

// Editar cliente
app.put("/api/clientes/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, precio, caducidad, usuario, password, recomendaciones } = req.body;
  await pool.query(
    "UPDATE clientes SET nombre=$1, precio=$2, caducidad=$3, usuario=$4, password=$5, recomendaciones=$6 WHERE id=$7",
    [nombre, precio, caducidad, usuario, password, recomendaciones, id]
  );
  res.json({ message: "Cliente actualizado" });
});

// Eliminar cliente
app.delete("/api/clientes/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM clientes WHERE id=$1", [id]);
  res.json({ message: "Cliente eliminado" });
});

app.get("/", (req, res) => res.send("Servidor con base de datos funcionando 🚀"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
