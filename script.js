// --- 1. IMPORTS DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
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
    serverTimestamp,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 2. CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCA2fZvN8WVKWwEDL0z694C2o5190OMhq8",
  authDomain: "gestioncandy-b9356.firebaseapp.com",
  projectId: "gestioncandy-b9356",
  storageBucket: "gestioncandy-b9356.firebasestorage.app",
  messagingSenderId: "869982852654",
  appId: "1:869982852654:web:ac450321a746e62365f1bf"
};

const appId = "gestioncandy-b9356"; 

// --- 3. INICIALIZACIÓN DE FIREBASE ---
let app, auth, db;
let userId = null;
let unsubscribeClientListener = null;

// --- Variables de estado de la aplicación ---
let allClientNames = []; 
let fullClientList = []; 
let modalConfirmResolve = null; // Para manejar la promesa del modal

// --- 4. INICIALIZACIÓN DE LA APP ---
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase inicializado correctamente.");
} catch (e) {
    console.error("Error al inicializar Firebase:", e);
    document.body.innerHTML = "Error al conectar con Firebase. Revisa la configuración.";
}

// --- 5. MANEJO DE AUTENTICACIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userId = user.uid;
        console.log("Usuario autenticado:", userId);
        if (!unsubscribeClientListener) {
            setupClientListener(userId);
        }
    } else {
        console.log("Usuario no autenticado, intentando iniciar sesión...");
        userId = null;
        if (unsubscribeClientListener) {
            unsubscribeClientListener();
            unsubscribeClientListener = null;
        }
        try {
            await signInAnonymously(auth);
            console.log("Login anónimo exitoso.");
        } catch (error) {
            console.error("Error en el login anónimo:", error);
        }
    }
});

// Botón de Logout
document.getElementById('logout-button').addEventListener('click', () => {
    console.log("Cerrando sesión...");
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});


// --- 6. SISTEMA DE MODAL (Reemplaza alert/confirm) ---

const modalBackdrop = document.getElementById('modal-backdrop');
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalButtons = document.getElementById('modal-buttons');

/**
 * Muestra una alerta (un solo botón "Aceptar").
 * @param {string} title - Título del modal.
 * @param {string} message - Mensaje del modal.
 */
function showAlert(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalButtons.innerHTML = '<button id="modal-alert-ok-btn" class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Aceptar</button>';
    
    modalBackdrop.classList.remove('hidden');
    modalContainer.classList.remove('hidden');
    
    document.getElementById('modal-alert-ok-btn').addEventListener('click', () => {
        modalBackdrop.classList.add('hidden');
        modalContainer.classList.add('hidden');
    }, { once: true });
}

/**
 * Muestra una confirmación (dos botones) y devuelve una Promesa.
 * @param {string} title - Título del modal.
 * @param {string} message - Mensaje del modal.
 * @returns {Promise<boolean>} - Resuelve 'true' si se confirma, 'false' si se cancela.
 */
function showConfirm(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalButtons.innerHTML = `
        <button id="modal-cancel-btn" class="rounded-md bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300">Cancelar</button>
        <button id="modal-confirm-btn" class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">Confirmar</button>`;
    
    modalBackdrop.classList.remove('hidden');
    modalContainer.classList.remove('hidden');

    return new Promise((resolve) => {
        modalConfirmResolve = resolve;
        
        document.getElementById('modal-cancel-btn').addEventListener('click', handleModalCancel, { once: true });
        document.getElementById('modal-confirm-btn').addEventListener('click', handleModalConfirm, { once: true });
    });
}

function handleModalConfirm() {
    modalBackdrop.classList.add('hidden');
    modalContainer.classList.add('hidden');
    if (modalConfirmResolve) modalConfirmResolve(true);
}

function handleModalCancel() {
    modalBackdrop.classList.add('hidden');
    modalContainer.classList.add('hidden');
    if (modalConfirmResolve) modalConfirmResolve(false);
}


// --- 7. LÓGICA DE NAVEGACIÓN Y UI ---
let showPage; // Declarar showPage en un ámbito superior

document.addEventListener('DOMContentLoaded', () => {
    // --- Selectores de Navegación ---
    const navLinks = document.querySelectorAll('.nav-link');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('page-title');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    // --- Selectores de "Añadir Cliente" ---
    const addClientForm = document.getElementById('add-client-form');
    const successMessage = document.getElementById('add-client-success');
    const creationDateInput = document.getElementById('client-creation-date');
    const expiryDateInput = document.getElementById('client-expiry-date');
    const addRecomendacionBtn = document.getElementById('add-recomendacion-btn');
    const recomendacionesContainer = document.getElementById('recomendaciones-container');
    const cancelAddClientBtn = document.getElementById('cancel-add-client-btn'); // Botón Cancelar

    // --- Selectores de "Lista de Clientes" ---
    const searchBar = document.getElementById('search-bar');
    const clientListContainer = document.getElementById('client-list-container');

    // --- Navegación ---
    showPage = function(pageId) {
        pageContents.forEach(page => page.classList.add('hidden'));
        const activePage = document.getElementById(`page-${pageId}`);
        if (activePage) {
            activePage.classList.remove('hidden');
            const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
            pageTitle.textContent = link ? link.querySelector('span').textContent : 'Página';
            navLinks.forEach(l => l.classList.remove('active'));
            if(link) link.classList.add('active');
        }
        hideMobileMenu();

        // Si vamos a la página de "Añadir Cliente", reseteamos el formulario
        if (pageId === 'add-cliente') {
            addClientForm.reset();
            recomendacionesContainer.innerHTML = '';
            initializeDateFields();
        }
    }
    
    document.getElementById('nav-links').addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link && link.dataset.page) {
            e.preventDefault();
            showPage(link.dataset.page);
        }
    });

    function hideMobileMenu() {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('hidden');
    }
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.remove('-translate-x-full');
        sidebarOverlay.classList.remove('hidden');
    });
    
    sidebarOverlay.addEventListener('click', hideMobileMenu);

    // --- Lógica de Búsqueda ---
    searchBar.addEventListener('input', renderLogic);

    // --- Lógica del Formulario "Añadir Cliente" ---

    initializeDateFields();

    creationDateInput.addEventListener('change', () => {
        try {
            const creationDate = new Date(creationDateInput.value);
            const correctedCreationDate = new Date(creationDate.getTime() + creationDate.getTimezoneOffset() * 60000);
            
            correctedCreationDate.setMonth(correctedCreationDate.getMonth() + 3);
            expiryDateInput.value = formatDate(correctedCreationDate);
        } catch (e) {
            console.error("Fecha de creación inválida");
        }
    });

    addRecomendacionBtn.addEventListener('click', addRecomendacionField);

    recomendacionesContainer.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('remove-recomendacion-btn')) {
            e.target.parentElement.remove();
        }
    });

    // Botón Cancelar (NUEVO)
    cancelAddClientBtn.addEventListener('click', () => {
        // No es necesario resetear (showPage lo hace), solo navegar
        showPage('clientes'); // O 'dashboard'
    });

    // Enviar formulario
    addClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!userId) {
            showAlert("Error", "Debes estar autenticado para añadir clientes.");
            return;
        }

        const recInputs = document.querySelectorAll('.recomendacion-input');
        const recomendaciones = Array.from(recInputs)
            .map(input => input.value.trim())
            .filter(val => val !== '');

        let allValid = true;
        for (const rec of recomendaciones) {
            if (!allClientNames.includes(rec)) {
                allValid = false;
                showAlert("Error de validación", `El cliente recomendado "${rec}" no existe. Por favor, corrígelo o elimínalo.`);
                break;
            }
        }
        if (!allValid) return;

        const newClientData = {
            name: addClientForm['client-name'].value,
            fechaCreacion: addClientForm['client-creation-date'].value,
            fechaCaducidad: addClientForm['client-expiry-date'].value,
            usuario: addClientForm['client-user'].value,
            password: addClientForm['client-password'].value,
            dispositivo: addClientForm['client-device'].value,
            aplicacion: addClientForm['client-app'].value,
            phone: addClientForm['client-phone'].value,
            recomendaciones: recomendaciones,
            notas: addClientForm['client-notes'].value,
            createdAt: serverTimestamp()
        };

        try {
            const clientsCollectionPath = `/artifacts/${appId}/users/${userId}/clients`;
            await addDoc(collection(db, clientsCollectionPath), newClientData);
            
            console.log("Cliente añadido a Firestore.");
            // Reset/Navegación ya se maneja en showPage
            
            successMessage.classList.remove('hidden');
            setTimeout(() => successMessage.classList.add('hidden'), 3000);
            
            showPage('clientes');
            
        } catch (error) {
            console.error("Error al añadir cliente:", error);
            showAlert("Error", "Hubo un error al guardar el cliente. Revisa la consola (F12) para más detalles.");
        }
    });

    // --- Lógica de borrado de cliente (delegación de eventos) ---
    clientListContainer.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.delete-client-btn');
        if (deleteButton) {
            const clientId = deleteButton.dataset.id;
            const clientName = deleteButton.dataset.name;
            
            // Usando el nuevo modal de confirmación
            const confirmed = await showConfirm("Confirmar Eliminación", `¿Estás seguro de que quieres eliminar a "${clientName}"?`);
            
            if (confirmed) {
                try {
                    const docPath = `/artifacts/${appId}/users/${userId}/clients/${clientId}`;
                    await deleteDoc(doc(db, docPath));
                    console.log(`Cliente ${clientId} eliminado.`);
                } catch (error) {
                    console.error("Error al eliminar cliente:", error);
                    showAlert("Error", "No se pudo eliminar el cliente.");
                }
            }
        }
    });

    showPage('dashboard');
});

// --- 8. LÓGICA DE DATOS (FIRESTORE) ---

function setupClientListener(currentUserId) {
    console.log(`Configurando listener para el usuario: ${currentUserId}`);
    const clientsCollectionPath = `/artifacts/${appId}/users/${currentUserId}/clients`;
    const q = query(collection(db, clientsCollectionPath));
    
    unsubscribeClientListener = onSnapshot(q, (snapshot) => {
        console.log(`Nuevos datos recibidos: ${snapshot.size} clientes.`);
        
        fullClientList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allClientNames = fullClientList.map(c => c.name);

        updateDatalist(allClientNames);
        updateDashboardStats(fullClientList);
        renderLogic();

    }, (error) => {
        console.error("Error en el listener de Firestore:", error);
        document.getElementById('client-list-container').innerHTML = '<p class="text-red-500">Error al cargar clientes.</p>';
    });
}

function updateDashboardStats(clients) {
    const clientCountElement = document.getElementById('client-count');
    const clientSoonCountElement = document.getElementById('client-soon-count');
    const clientExpiredCountElement = document.getElementById('client-expired-count');

    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    
    const soonLimit = new Date();
    soonLimit.setDate(now.getDate() + 30);

    let soonCount = 0;
    let expiredCount = 0;

    clients.forEach(client => {
        if (!client.fechaCaducidad) return; 
        
        try {
            const expiryDate = new Date(client.fechaCaducidad);
            const correctedExpiryDate = new Date(expiryDate.getTime() + expiryDate.getTimezoneOffset() * 60000);

            if (correctedExpiryDate < now) {
                expiredCount++;
            } else if (correctedExpiryDate >= now && correctedExpiryDate <= soonLimit) {
                soonCount++;
            }
        } catch(e) {
            console.warn(`Fecha de caducidad inválida para cliente ${client.id}: ${client.fechaCaducidad}`);
        }
    });

    clientCountElement.textContent = clients.length;
    clientSoonCountElement.textContent = soonCount;
    clientExpiredCountElement.textContent = expiredCount;
}

function renderLogic() {
    const searchBar = document.getElementById('search-bar');
    const searchTerm = searchBar.value.toLowerCase();

    const sortedClients = [...fullClientList].sort((a, b) => {
        const dateA = a.fechaCaducidad ? new Date(a.fechaCaducidad) : new Date(0);
        const dateB = b.fechaCaducidad ? new Date(b.fechaCaducidad) : new Date(0);
        return dateA - dateB;
    });

    const filteredClients = searchTerm
        ? sortedClients.filter(client => client.name.toLowerCase().includes(searchTerm))
        : sortedClients;

    renderClientList(filteredClients);
}

function renderClientList(clientsToRender) {
    const clientListContainer = document.getElementById('client-list-container');
    const clientListPlaceholder = document.getElementById('client-list-placeholder');
    clientListContainer.innerHTML = ''; 

    if (clientsToRender.length === 0) {
        clientListContainer.appendChild(clientListPlaceholder);
    } else {
        clientsToRender.forEach(client => {
            const card = document.createElement('div');
            card.className = 'client-card-enter flex items-center justify-between rounded border border-gray-200 p-4';
            
            let dateColor = "text-gray-500";
            try {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const expiryDate = new Date(client.fechaCaducidad);
                const correctedExpiryDate = new Date(expiryDate.getTime() + expiryDate.getTimezoneOffset() * 60000);

                if (correctedExpiryDate < now) {
                    dateColor = "text-red-600 font-bold";
                } else {
                    const soonLimit = new Date();
                    soonLimit.setDate(now.getDate() + 30);
                    if (correctedExpiryDate <= soonLimit) {
                        dateColor = "text-yellow-600 font-semibold";
                    }
                }
            } catch(e) {} 

            card.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800">${client.name}</p>
                    <p class="text-sm text-gray-600">${client.usuario || 'Sin usuario'}</p>
                    <p class="text-sm ${dateColor}">Caduca: ${client.fechaCaducidad || 'N/A'}</p>
                </div>
                <button class="delete-client-btn text-gray-400 hover:text-red-500" data-id="${client.id}" data-name="${client.name}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            clientListContainer.appendChild(card);
        });
    }
}

// --- 9. FUNCIONES DE AYUDA (Helpers) ---

function formatDate(date) {
    if (!date || isNaN(date.getTime())) {
        return ""; 
    }
    return date.toISOString().split('T')[0];
}

function initializeDateFields() {
    const creationDateInput = document.getElementById('client-creation-date');
    const expiryDateInput = document.getElementById('client-expiry-date');
    
    const today = new Date();
    const expiry = new Date();
    expiry.setMonth(today.getMonth() + 3);

    creationDateInput.value = formatDate(today);
    expiryDateInput.value = formatDate(expiry);
}

function addRecomendacionField() {
    const container = document.getElementById('recomendaciones-container');
    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'flex items-center';
    
    fieldWrapper.innerHTML = `
        <input type="text" 
               class="recomendacion-input block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
               list="existing-clients-list" 
               placeholder="Buscar nombre de cliente...">
        <button type="button" class="remove-recomendacion-btn">&times;</button>
    `;
    container.appendChild(fieldWrapper);
}

function updateDatalist(names) {
    const datalist = document.getElementById('existing-clients-list');
    if (!datalist) return;
    
    datalist.innerHTML = ''; 
    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
    });
}


