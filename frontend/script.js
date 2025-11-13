const API_URL = "https://gestion19.onrender.com // Cambia esto luego

const form = document.getElementById("form");
const contenedor = document.getElementById("clientes-container");

document.getElementById("agregar").addEventListener("click", async () => {
  const cliente = {
    nombre: nombre.value,
    precio: precio.value,
    caducidad: caducidad.value,
    usuario: usuario.value,
    password: password.value,
    recomendaciones: recomendaciones.value,
  };

  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cliente),
  });

  cargarClientes();
  form.reset();
});

async function cargarClientes() {
  const res = await fetch(API_URL);
  const data = await res.json();
  contenedor.innerHTML = data.map(c => `
    <div class="card">
      <h3>${c.nombre}</h3>
      <p>💶 ${c.precio}</p>
      <p>⏰ Caduca: ${c.caducidad}</p>
      <p>👤 ${c.usuario}</p>
      <p>🔑 ${c.password}</p>
      <p>📝 ${c.recomendaciones}</p>
    </div>
  `).join("");
}

cargarClientes();
