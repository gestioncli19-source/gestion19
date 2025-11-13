import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Datos simulados (puedes conectar a una BD real más tarde)
let clientes = [];

// Obtener todos los clientes
app.get("/api/clientes", (req, res) => {
  res.json(clientes);
});

// Agregar cliente
app.post("/api/clientes", (req, res) => {
  const nuevo = { id: Date.now(), ...req.body };
  clientes.push(nuevo);
  res.status(201).json(nuevo);
});

// Editar cliente
app.put("/api/clientes/:id", (req, res) => {
  const id = parseInt(req.params.id);
  clientes = clientes.map(c => c.id === id ? { ...c, ...req.body } : c);
  res.json({ message: "Cliente actualizado" });
});

// Eliminar cliente
app.delete("/api/clientes/:id", (req, res) => {
  const id = parseInt(req.params.id);
  clientes = clientes.filter(c => c.id !== id);
  res.json({ message: "Cliente eliminado" });
});

app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
