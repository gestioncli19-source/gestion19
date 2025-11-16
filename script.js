// --- 3.1 IMPORTS DE FIREBASE ---
// Estas importaciones son necesarias para que Firebase funcione.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc,
    addDoc,
    collection, 
    query,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 3.2 CONFIGURACIÓN DE FIREBASE ---

// ¡¡¡ IMPORTANTE !!!
// Para tu proyecto real en GitHub, DEBES usar la configuración que me diste.
// Las variables __app_id, __firebase_config, etc., NO existirán fuera de esta plataforma.

// --- INICIO: CÓDIGO PARA TU PROYECTO REAL (DESCOMENTA ESTO) ---
const firebaseConfig = {
  apiKey: "AIzaSyCA2fZvN8WVKWwEDL0z694C2o5190OMhq8",
  authDomain: "gestioncandy-b9356.firebaseapp.com",
  projectId: "gestioncandy-b9356",
  storageBucket: "gestioncandy-b9356.firebasestorage.app",
  messagingSenderId: "869982852654",
  appId: "1:869982852654:web:ac450321a746e62365f1bf"
};

// Usa el ID de tu proyecto o un nombre único para las rutas de la base de datos
const appId = "gestioncandy-b9356"; 

// En tu app real, no tendrás un 'initialAuthToken'.
// Deberás implementar tu propio sistema de login (ej. con email/pass, Google, etc.)
// Por ahora, usaremos 'signInAnonymously' si 'initialAuthToken' es nulo.
const initialAuthToken = null; 
// --- FIN: CÓDIGO PARA TU PROYECTO REAL ---


/*
// --- INICIO: CÓDIGO SOLO PARA LA PLATAFORMA (COMENTA ESTO EN TU PROYECTO) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? '{}' : __firebase_config);
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
// --- FIN: CÓDIGO SOLO PARA LA PLATAFORMA ---
*/


// --- 3.3 INICIALIZACIÓN DE FIREBASE ---
let app, auth, db;
let userId = null;
let unsubscribeClientListener = null; // Para detener el listener al hacer logout

try {
    // Inicializar Firebase
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase inicializado correctamente.");
} catch (e) {
    console.error("Error al inicializar Firebase:", e);
    document.body.innerHTML = "Error al conectar con Firebase. Revisa la configuración.";
}

// --- 3.4 MANEJO DE AUTENTICACIÓN ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Usuario autenticado
        userId = user.uid;
        console.log("Usuario autenticado:", userId);
        document.getElementById('user-id-display').textContent = `ID: ${userId.substring(0, 8)}...`;
        document.getElementById('user-id-debug').textContent = userId;

        // Iniciar listener de clientes SÓLO si no existe ya
        if (!unsubscribeClientListener) {
            setupClientListener(userId);
        }

    } else {
        // Usuario no autenticado
        console.log("Usuario no autenticado, intentando iniciar sesión...");
        userId = null;
        document.getElementById('user-id-display').textContent = "Desconectado";
        
        // Detener el listener de clientes si existe
        if (unsubscribeClientListener) {
            unsubscribeClientListener();
            unsubscribeClientListener = null;
            console.log("Listener de clientes detenido.");
        }

        // Intentar autenticación (primero con token, luego anónima)
        try {
            if (initialAuthToken) {
                // Esto solo funcionará en la plataforma
                await signInWithCustomToken(auth, initialAuthToken);
                console.log("Login con Custom Token exitoso.");
            } else {
                // Esto se ejecutará en tu proyecto real (hasta que pongas un login)
                await signInAnonymously(auth);
                console.log("Login anónimo exitoso.");
            }
        } catch (error) {
            console.error("Error en el proceso de autenticación:", error);
            document.getElementById('user-id-display').textContent = "Error de Auth";
        }
    }
});

// Botón de Logout
document.getElementById('logout-button').addEventListener('click', () => {
    console.log("Cerrando sesión...");
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});

// --- 3.5 LÓGICA DE NAVEGACIÓN Y UI ---

// Esperamos a que el DOM esté cargado para asignar los listeners
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('page-title');
    
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    // Función para cambiar de página
    function showPage(pageId) {
        // Ocultar todas las páginas
        pageContents.forEach(page => page.classList.add('hidden'));
        
        // Mostrar la página seleccionada
        const activePage = document.getElementById(`page-${pageId}`);
        if (activePage) {
            activePage.classList.remove('hidden');
            
            // Actualizar el título
            const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
            pageTitle.textContent = link ? link.querySelector('span').textContent : 'Página';
            
            // Actualizar clase activa en el menú
            navLinks.forEach(l => l.classList.remove('active'));
            if(link) {
                link.classList.add('active');
            }
        }
        
        // Ocultar menú móvil al cambiar de página
        hideMobileMenu();
    }
    
    // Navegación principal
    document.getElementById('nav-links').addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link && link.dataset.page) {
            e.preventDefault();
            showPage(link.dataset.page);
        }
    });

    // Lógica del menú móvil
    function hideMobileMenu() {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('hidden');
    }
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.remove('-translate-x-full');
        sidebarOverlay.classList.remove('hidden');
    });
    
    sidebarOverlay.addEventListener('click', hideMobileMenu);

    // Mostrar página de dashboard por defecto
    showPage('dashboard');
    
    // --- 3.6 LÓGICA DE FIRESTORE (CLIENTES) ---
    
    // Añadir Cliente
    const addClientForm = document.getElementById('add-client-form');
    const successMessage = document.getElementById('add-client-success');

    addClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!userId) {
            alert("Error: Debes estar autenticado para añadir clientes.");
            return;
        }
        
        const name = addClientForm['client-name'].value;
        const email = addClientForm['client-email'].value;
        const phone = addClientForm['client-phone'].value;
        
        // Ruta de la colección (privada para cada usuario)
        // Usamos la variable 'appId' que definimos arriba
        const clientsCollectionPath = `/artifacts/${appId}/users/${userId}/clients`;
        
        try {
            // Añadir documento a Firestore
            await addDoc(collection(db, clientsCollectionPath), {
                name: name,
                email: email,
                phone: phone,
                createdAt: serverTimestamp() // Usar la hora del servidor
            });
            
            // Éxito
            console.log("Cliente añadido a Firestore.");
            addClientForm.reset();
            successMessage.classList.remove('hidden');
            setTimeout(() => successMessage.classList.add('hidden'), 3000);
            
            // Volver a la lista de clientes
            showPage('clientes');
            
        } catch (error) {
            console.error("Error al añadir cliente:", error);
            alert("Hubo un error al guardar el cliente.");
        }
    });
});

// Función para configurar el listener de Clientes (se llama post-auth)
function setupClientListener(currentUserId) {
    console.log(`Configurando listener para el usuario: ${currentUserId}`);
    // Usamos la variable 'appId' que definimos arriba
    const clientsCollectionPath = `/artifacts/${appId}/users/${currentUserId}/clients`;
    const clientListContainer = document.getElementById('client-list-container');
    const clientListPlaceholder = document.getElementById('client-list-placeholder');
    const clientCountElement = document.getElementById('client-count');
    
    const q = query(collection(db, clientsCollectionPath));
    
    // onSnapshot crea un listener en tiempo real
    unsubscribeClientListener = onSnapshot(q, (snapshot) => {
        console.log(`Nuevos datos recibidos: ${snapshot.size} clientes.`);
        // Limpiar lista
        clientListContainer.innerHTML = '';
        
        if (snapshot.empty) {
            clientListContainer.appendChild(clientListPlaceholder);
            clientCountElement.textContent = '0';
        } else {
            clientCountElement.textContent = snapshot.size;

            // Procesar y ordenar los datos en memoria
            const clients = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
                    // Ordenar por fecha de creación (los más nuevos primero)
                    const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
                    const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
                    return dateB - dateA;
                });

            // Renderizar clientes
            clients.forEach(client => {
                const card = document.createElement('div');
                card.className = 'client-card-enter flex items-center justify-between rounded border border-gray-200 p-4';
                card.innerHTML = `
                    <div>
                        <p class="font-semibold text-gray-800">${client.name}</p>
                        <p class="text-sm text-gray-600">${client.email}</p>
                        <p class="text-sm text-gray-500">${client.phone || 'Sin teléfono'}</p>
                    </div>
                    <button class="text-gray-400 hover:text-red-500" data-id="${client.id}">
                        <!-- Icono Borrar (placeholder) -->
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                `;
                // Aquí podrías añadir un listener al botón de borrar
                clientListContainer.appendChild(card);
            });
        }
    }, (error) => {
        console.error("Error en el listener de Firestore:", error);
        clientListContainer.innerHTML = '<p class="text-red-500">Error al cargar clientes.</p>';
    });
}

