// ====================================================================
// 1. CONFIGURACIÓN DE FIREBASE
// ====================================================================

// IMPORTANTE:
// 1. Ve a la consola de tu proyecto de Firebase.
// 2. Ve a "Configuración del proyecto" (el icono de engranaje).
// 3. Baja a "Tus apps" y selecciona tu app web.
// 4. Elige "Configuración" (SDK de Firebase).
// 5. Copia el objeto 'firebaseConfig' y pégalo aquí.
// 6. Asegúrate de que los scripts 'compat' estén en tu index.html

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase (usando la sintaxis 'compat' que pusimos en el HTML)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const clientesCol = db.collection('clientes');

// ====================================================================
// 2. CLAVE DE ENCRIPTACIÓN
// ====================================================================
// ADVERTENCIA: En una app 100% JavaScript, esta clave es visible en el
// código fuente. Es una barrera de seguridad básica, no infalible.
const SECRET_KEY = "tu-clave-secreta-muy-segura-123";

// ====================================================================
// 3. REFERENCIAS A ELEMENTOS DEL DOM
// ====================================================================
const formulario = document.getElementById('formulario-cliente');
const listaClientes = document.getElementById('lista-clientes');
const clienteIdInput = document.getElementById('cliente-id');
const botonCancelar = document.getElementById('boton-cancelar');

// ====================================================================
// 4. LÓGICA PRINCIPAL (CRUD)
// ====================================================================

// --- FUNCIÓN PARA GUARDAR (Crear o Actualizar) ---
const guardarCliente = async (e) => {
    e.preventDefault(); // Evitar que el formulario recargue la página

    // Recoger todos los valores del formulario
    const nombre = formulario.nombre.value;
    const fechaCreacion = formulario['fecha-creacion'].value;
    const fechaCaducidad = formulario['fecha-caducidad'].value;
    const usuario = formulario.usuario.value;
    const contrasena = formulario.contrasena.value;
    const dispositivo = formulario.dispositivo.value;
    const aplicacion = formulario.aplicacion.value;
    const recomendaciones = formulario.recomendaciones.value;
    const notas = formulario.notas.value;
    const id = clienteIdInput.value;

    // --- Encriptación de la contraseña ---
    let contrasenaEncriptada = "";
    if (contrasena) {
        contrasenaEncriptada = CryptoJS.AES.encrypt(contrasena, SECRET_KEY).toString();
    }

    const cliente = {
        nombre,
        fechaCreacion,
        fechaCaducidad,
        usuario,
        contrasena: contrasenaEncriptada, // Guardamos la versión encriptada
        dispositivo,
        aplicacion,
        recomendaciones,
        notas
    };

    try {
        if (id) {
            // --- Lógica de ACTUALIZAR ---
            await clientesCol.doc(id).update(cliente);
            console.log('Cliente actualizado con éxito');
        } else {
            // --- Lógica de CREAR ---
            await clientesCol.add(cliente);
            console.log('Cliente creado con éxito');
        }
        formulario.reset(); // Limpiar el formulario
        clienteIdInput.value = ''; // Limpiar el ID oculto
    } catch (error) {
        console.error("Error al guardar el cliente: ", error);
        alert("Error al guardar el cliente: " + error.message);
    }
};

// --- FUNCIÓN PARA CALCULAR ESTADO DE CADUCIDAD ---
const calcularEstadoCaducidad = (fechaCaducidadStr) => {
    if (!fechaCaducidadStr) {
        return { clase: 'caducidad-verde', texto: 'Sin fecha' };
    }
    
    // Añadimos T00:00:00 para evitar problemas de zona horaria al comparar solo fechas
    const fechaCad = new Date(fechaCaducidadStr + 'T00:00:00');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Poner la hora de 'hoy' a medianoche para comparar

    const diffTime = fechaCad.getTime() - hoy.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        return { clase: 'caducidad-roja', texto: '¡Caducado!' };
    } else if (diffDays <= 7) {
        return { clase: 'caducidad-roja', texto: `Caduca en ${diffDays} días` };
    } else if (diffDays <= 30) {
        return { clase: 'caducidad-amarilla', texto: `Caduca en ${diffDays} días` };
    } else {
        return { clase: 'caducidad-verde', texto: 'En orden' };
    }
};

// --- FUNCIÓN PARA MOSTRAR/PINTAR CLIENTES EN EL HTML ---
const renderizarCliente = (doc) => {
    const cliente = doc.data();
    const id = doc.id;

    // Calcular estado de caducidad
    const estado = calcularEstadoCaducidad(cliente.fechaCaducidad);

    // Formatear fecha para mostrarla (dd/mm/aaaa)
    let fechaFormateada = 'N/A';
    if (cliente.fechaCaducidad) {
        const [year, month, day] = cliente.fechaCaducidad.split('-');
        fechaFormateada = `${day}/${month}/${year}`;
    }

    // Crear la tarjeta HTML
    const card = document.createElement('div');
    card.className = `card cliente-card ${estado.clase}`; // Aplicar clase de caducidad
    card.setAttribute('data-id', id);

    card.innerHTML = `
        <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h5 class="card-title">${cliente.nombre}</h5>
                    <p class="card-text mb-1"><strong>Usuario:</strong> ${cliente.usuario || 'N/A'}</p>
                    <p class="card-text"><strong>Caduca:</strong> ${fechaFormateada}</p>
                </div>
                <span class="badge bg-light text-dark">${estado.texto}</span>
            </div>
            <div class="mt-3">
                <button class="btn btn-sm btn-info btn-editar">Editar</button>
                <button class="btn btn-sm btn-danger btn-eliminar">Eliminar</button>
                <button class="btn btn-sm btn-outline-secondary btn-ver-mas">Ver Más</button>
            </div>
        </div>
    `;

    // --- Lógica de botones dentro de la tarjeta ---
    
    // Botón Eliminar
    card.querySelector('.btn-eliminar').addEventListener('click', async () => {
        if (confirm(`¿Estás seguro de que quieres eliminar a ${cliente.nombre}?`)) {
            try {
                await clientesCol.doc(id).delete();
                console.log('Cliente eliminado');
            } catch (error) {
                console.error("Error al eliminar: ", error);
            }
        }
    });

    // Botón Editar
    card.querySelector('.btn-editar').addEventListener('click', () => {
        // Llenar el formulario con los datos
        clienteIdInput.value = id;
        formulario.nombre.value = cliente.nombre;
        formulario['fecha-creacion'].value = cliente.fechaCreacion;
        formulario['fecha-caducidad'].value = cliente.fechaCaducidad;
        formulario.usuario.value = cliente.usuario;
        formulario.dispositivo.value = cliente.dispositivo;
        formulario.aplicacion.value = cliente.aplicacion;
        formulario.recomendaciones.value = cliente.recomendaciones;
        formulario.notas.value = cliente.notas;

        // Desencriptar contraseña y ponerla en el formulario
        try {
            if (cliente.contrasena) {
                const bytes = CryptoJS.AES.decrypt(cliente.contrasena, SECRET_KEY);
                const contrasenaOriginal = bytes.toString(CryptoJS.enc.Utf8);
                formulario.contrasena.value = contrasenaOriginal;
            } else {
                formulario.contrasena.value = '';
            }
        } catch (e) {
            console.error("Error al desencriptar: ", e);
            formulario.contrasena.value = 'Error al leer';
        }
        
        // Mover la vista al formulario
        window.scrollTo(0, 0);
    });

    // Botón Ver Más (usando un simple 'alert' por ahora)
    card.querySelector('.btn-ver-mas').addEventListener('click', () => {
        // Desencriptar solo para mostrar
        let passParaMostrar = "******";
        try {
            if (cliente.contrasena) {
                const bytes = CryptoJS.AES.decrypt(cliente.contrasena, SECRET_KEY);
                passParaMostrar = bytes.toString(CryptoJS.enc.Utf8);
            }
        } catch (e) { /* No hacer nada, se queda '******' */ }

        alert(
`Detalles de: ${cliente.nombre}
---------------------------------
Usuario: ${cliente.usuario}
Contraseña: ${passParaMostrar}
Dispositivo: ${cliente.dispositivo}
Aplicación: ${cliente.aplicacion}
Recomendaciones: ${cliente.recomendaciones}
Notas: ${cliente.notas}
---------------------------------
Creado: ${cliente.fechaCreacion}
Caduca: ${cliente.fechaCaducidad}
`
        );
    });

    listaClientes.appendChild(card);
};

// ====================================================================
// 5. EVENT LISTENERS (ESCUCHADORES DE EVENTOS)
// ====================================================================

// --- Cargar clientes cuando la página esté lista ---
// Usamos 'onSnapshot' para escuchar cambios en TIEMPO REAL.
// La app se actualizará sola si añades o cambias algo en Firebase.
window.addEventListener('DOMContentLoaded', () => {
    // Ordenamos por fecha de caducidad, ascendente (las más próximas primero)
    const q = clientesCol.orderBy('fechaCaducidad', 'asc');

    q.onSnapshot((querySnapshot) => {
        listaClientes.innerHTML = ''; // Limpiar la lista antes de volver a pintar
        if (querySnapshot.empty) {
            listaClientes.innerHTML = '<p class="text-center">No hay clientes registrados.</p>';
        } else {
            querySnapshot.forEach((doc) => {
                renderizarCliente(doc);
            });
        }
    });
});

// --- Escuchador para el envío del formulario ---
formulario.addEventListener('submit', guardarCliente);

// --- Escuchador para el botón de Cancelar Edición ---
botonCancelar.addEventListener('click', () => {
    formulario.reset();
    clienteIdInput.value = '';
});
