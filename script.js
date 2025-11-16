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
    addDoc,
    collection, 
    query,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
    updateDoc
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

// PROMISE para asegurar que la autenticación anónima ha finalizado
let authReadyResolve; 
const authReadyPromise = new Promise(resolve => {
    authReadyResolve = resolve;
});

// --- Variables de estado de la aplicación ---
let allClientNames = []; 
let fullClientList = []; 
let modalConfirmResolve = null; 
let currentFilter = 'all';

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
        authReadyResolve(userId); // Resuelve la promesa con el ID real
    } else {
        console.log("Usuario no autenticado, intentando iniciar sesión anónima...");
        userId = null;
        if (unsubscribeClientListener) {
            unsubscribeClientListener();
            unsubscribeClientListener = null;
        }
        try {
            await signInAnonymously(auth);
            // onAuthStateChanged se disparará de nuevo con el nuevo user
        } catch (error) {
            console.error("Error en el login anónimo:", error);
            authReadyResolve('auth_failed'); // Resuelve la promesa con error si falla
        }
    }
});

// FUNCIÓN CLAVE: Espera que la autenticación termine antes de escribir
async function getValidatedUserId() {
    if (userId) return userId;
    const result = await authReadyPromise;
    if (result === 'auth_failed' || !userId) {
         // En modo de pruebas, permitimos el fallo temporal si no es error de Firebase
         if (auth.currentUser?.uid) return auth.currentUser.uid;
         throw new Error("Autenticación fallida o pendiente. Intenta de nuevo.");
    }
    return userId;
}

document.getElementById('logout-button').addEventListener('click', () => {
    console.log("Cerrando sesión...");
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});

// --- 6. SISTEMA DE MODAL (Confirmar/Alerta) ---
const modalBackdrop = document.getElementById('modal-backdrop');
const modalContainer = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalButtons = document.getElementById('modal-buttons');

function showAlert(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalButtons.innerHTML = '<button id="modal-alert-ok-btn" class="button-primary">Aceptar</button>';
    
    modalBackdrop.classList.remove('hidden');
    modalContainer.classList.remove('hidden');
    
    document.getElementById('modal-alert-ok-btn').addEventListener('click', () => {
        modalBackdrop.classList.add('hidden');
        modalContainer.classList.add('hidden');
    }, { once: true });
}

function showConfirm(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalButtons.innerHTML = `
        <button id="modal-cancel-btn" class="button-secondary">Cancelar</button>
        <button id="modal-confirm-btn" class="button-primary">Confirmar</button>`;
    
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
let showPage;

document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('page-title');
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    const addClientForm = document.getElementById('add-client-form');
    const successMessage = document.getElementById('add-client-success');
    const creationDateInput = document.getElementById('client-creation-date');
    const expiryDateInput = document.getElementById('client-expiry-date');
    const addRecomendacionBtn = document.getElementById('add-recomendacion-btn');
    const cancelAddClientBtn = document.getElementById('cancel-add-client-btn');
    
    const editClientForm = document.getElementById('edit-client-form');
    const editAddRecomendacionBtn = document.getElementById('edit-add-recomendacion-btn');
    const cancelEditClientBtn = document.getElementById('cancel-edit-client-btn');
    
    const searchBar = document.getElementById('search-bar');
    const clientListContainer = document.getElementById('client-list-container');
    
    const cardTotal = document.getElementById('dashboard-card-total');
    const cardSoon = document.getElementById('dashboard-card-soon');
    const cardExpired = document.getElementById('dashboard-card-expired');

    const viewModalBackdrop = document.getElementById('view-modal-backdrop');
    const viewModalContainer = document.getElementById('view-modal-container');
    const viewModalCloseBtn = document.getElementById('view-modal-close-btn');

    // --- Navegación ---
    showPage = function(pageId) {
        pageContents.forEach(page => page.classList.add('hidden'));
        const activePage = document.getElementById(`page-${pageId}`);
        if (activePage) {
            activePage.classList.remove('hidden');
            
            const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
            let titleText = 'Página';
            if (link) {
                titleText = link.querySelector('span').textContent;
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            } else if (pageId === 'edit-cliente') {
                titleText = 'Editar Cliente';
            } else if (pageId === 'settings') {
                titleText = 'Ajustes';
            }
            
            pageTitle.textContent = titleText;
        }
        hideMobileMenu();

        if (pageId === 'add-cliente') {
            addClientForm.reset();
            document.getElementById('recomendaciones-container').innerHTML = '';
            initializeDateFields(creationDateInput, expiryDateInput);
        }
        if (pageId === 'clientes') {
            searchBar.value = '';
            currentFilter = 'all';
            renderLogic();
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
    
    // CERRAR AL PULSAR FUERA
    sidebarOverlay.addEventListener('click', hideMobileMenu);

    // --- Lógica de Búsqueda y Filtro (Dashboard) ---
    searchBar.addEventListener('input', () => {
        currentFilter = 'search'; 
        renderLogic();
    });
    
    cardTotal.addEventListener('click', () => {
        currentFilter = 'all';
        showPage('clientes');
    });
    cardSoon.addEventListener('click', () => {
        currentFilter = 'soon';
        showPage('clientes');
    });
    cardExpired.addEventListener('click', () => {
        currentFilter = 'expired';
        showPage('clientes');
    });

    // --- Lógica Formulario "Añadir Cliente" ---
    initializeDateFields(creationDateInput, expiryDateInput);
    creationDateInput.addEventListener('change', () => updateExpiryDate(creationDateInput, expiryDateInput));
    addRecomendacionBtn.addEventListener('click', () => addRecomendacionField('recomendaciones-container'));
    document.getElementById('recomendaciones-container').addEventListener('click', handleRemoveRecomendacion);
    cancelAddClientBtn.addEventListener('click', () => showPage('clientes'));

    addClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let currentUserId;
        try {
            // FUNCIÓN CLAVE: Esperamos el ID de usuario antes de proceder
            currentUserId = await getValidatedUserId();
        } catch (error) {
            console.error("Error de autenticación:", error);
            showAlert("Error de Autenticación", "Aún no se pudo establecer la conexión con Firebase. Espera un momento y vuelve a intentarlo.");
            return;
        }


        const [isValid, recomendaciones] = validateRecomendaciones('recomendaciones-container');
        if (!isValid) return;

        const phoneVal = addClientForm['client-phone'].value.trim();
        
        const newClientData = {
            name: addClientForm['client-name'].value,
            fechaCreacion: addClientForm['client-creation-date'].value,
            fechaCaducidad: addClientForm['client-expiry-date'].value,
            usuario: addClientForm['client-user'].value,
            password: addClientForm['client-password'].value,
            dispositivo: addClientForm['client-device'].value,
            aplicacion: addClientForm['client-app'].value,
            phone: phoneVal ? `+34${phoneVal}` : '',
            recomendaciones: recomendaciones,
            notas: addClientForm['client-notes'].value,
            createdAt: serverTimestamp()
        };

        try {
            const clientsCollectionPath = `/artifacts/${appId}/users/${currentUserId}/clients`;
            await addDoc(collection(db, clientsCollectionPath), newClientData);
            
            successMessage.classList.remove('hidden');
            setTimeout(() => successMessage.classList.add('hidden'), 3000);
            showPage('clientes');
            
        } catch (error) {
            console.error("Error al añadir cliente (Firebase):", error);
            showAlert("Error de Firebase", "Hubo un error al guardar. Revisa las reglas de Firestore (F12).");
        }
    });
    
    // --- Lógica Formulario "Editar Cliente" ---
    editAddRecomendacionBtn.addEventListener('click', () => addRecomendacionField('edit-recomendaciones-container'));
    document.getElementById('edit-recomendaciones-container').addEventListener('click', handleRemoveRecomendacion);
    cancelEditClientBtn.addEventListener('click', () => showPage('clientes'));
    
    document.getElementById('edit-client-creation-date').addEventListener('change', () => {
        updateExpiryDate(
            document.getElementById('edit-client-creation-date'),
            document.getElementById('edit-client-expiry-date')
        );
    });

    editClientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientId = document.getElementById('edit-client-id').value;
        if (!userId || !clientId) {
            showAlert("Error", "No se pudo guardar. ID de cliente o usuario no encontrado.");
            return;
        }

        const [isValid, recomendaciones] = validateRecomendaciones('edit-recomendaciones-container');
        if (!isValid) return;

        const phoneVal = editClientForm['edit-client-phone'].value.trim();

        const updatedClientData = {
            name: editClientForm['edit-client-name'].value,
            fechaCreacion: editClientForm['edit-client-creation-date'].value,
            fechaCaducidad: editClientForm['edit-client-expiry-date'].value,
            usuario: editClientForm['edit-client-user'].value,
            password: editClientForm['edit-client-password'].value,
            dispositivo: editClientForm['edit-client-device'].value,
            aplicacion: editClientForm['edit-client-app'].value,
            phone: phoneVal ? `+34${phoneVal}` : '',
            recomendaciones: recomendaciones,
            notas: editClientForm['edit-client-notes'].value
        };
        
        try {
            const docPath = `/artifacts/${appId}/users/${userId}/clients/${clientId}`;
            await updateDoc(doc(db, docPath), updatedClientData);
            showAlert("Éxito", "Cliente actualizado correctamente.");
            showPage('clientes');
        } catch (error) {
            console.error("Error al actualizar cliente:", error);
            showAlert("Error", "Hubo un error al actualizar. Revisa la consola (F12).");
        }
    });

    // --- Lógica de borrado/edición/vista de cliente (delegación) ---
    clientListContainer.addEventListener('click', async (e) => {
        const deleteButton = e.target.closest('.delete-client-btn');
        const editButton = e.target.closest('.edit-client-btn');
        const actionButton = e.target.closest('.action-icon-button');
        const card = e.target.closest('.client-card');

        // Si se pulsó un botón de acción (editar o borrar), gestionar y salir
        if (actionButton) {
            if (deleteButton) {
                const clientId = deleteButton.dataset.id;
                const clientName = deleteButton.dataset.name;
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
            } else if (editButton) {
                const clientId = editButton.dataset.id;
                const client = fullClientList.find(c => c.id === clientId);
                if (client) {
                    populateEditForm(client);
                    showPage('edit-cliente'); 
                } else {
                    showAlert("Error", "No se pudieron cargar los datos del cliente.");
                }
            }
            return;
        }

        // Si no se pulsó un botón de acción, pero sí una tarjeta, mostrar el modal de vista
        if (card) {
            const clientId = card.dataset.id;
            const client = fullClientList.find(c => c.id === clientId);
            if (client) {
                showViewClientModal(client);
            }
        }
    });
    
    // --- Lógica Modal de Vista ---
    const viewModalContent = document.getElementById('view-modal-content');
    const viewModalCopyBtn = document.getElementById('view-modal-copy-btn');

    function showViewClientModal(client) {
        document.getElementById('view-modal-title').textContent = client.name || 'Datos del Cliente';
        
        const textToCopy = `Usuario: ${client.usuario || ''}
Contraseña: ${client.password || ''}
Fecha de caducidad: ${client.fechaCaducidad || ''}
Aplicación: ${client.aplicacion || ''}`;
        
        viewModalContent.textContent = textToCopy;
        
        viewModalBackdrop.classList.remove('hidden');
        viewModalContainer.classList.remove('hidden');
        
        // Asignar listener de copia
        viewModalCopyBtn.onclick = () => {
            copyTextToClipboard(textToCopy);
            viewModalCopyBtn.textContent = '¡Copiado!';
            setTimeout(() => { viewModalCopyBtn.textContent = 'Copiar Datos'; }, 2000);
        };
    }
    
    function hideViewClientModal() {
        viewModalBackdrop.classList.add('hidden');
        viewModalContainer.classList.add('hidden');
    }
    
    viewModalCloseBtn.addEventListener('click', hideViewClientModal);
    viewModalBackdrop.addEventListener('click', hideViewClientModal);


    showPage('dashboard');
});

// --- 8. LÓGICA DE DATOS (FIRESTORE) ---

function setupClientListener(currentUserId) {
    if (!currentUserId) {
         console.warn("Autenticación pendiente. No se puede iniciar el listener de Firestore.");
         return; 
    }
    
    const clientsCollectionPath = `/artifacts/${appId}/users/${currentUserId}/clients`;
    const q = query(collection(db, clientsCollectionPath));
    
    unsubscribeClientListener = onSnapshot(q, (snapshot) => {
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
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    const soonLimit = new Date();
    soonLimit.setDate(now.getDate() + 3);

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
            console.warn(`Fecha de caducidad inválida para ${client.id}`);
        }
    });

    document.getElementById('client-count').textContent = clients.length;
    document.getElementById('client-soon-count').textContent = soonCount;
    document.getElementById('client-expired-count').textContent = expiredCount;
}

function renderLogic() {
    const searchBar = document.getElementById('search-bar');
    const searchTerm = searchBar.value.toLowerCase();

    let processedClients = [...fullClientList].sort((a, b) => {
        const dateA = a.fechaCaducidad ? new Date(a.fechaCaducidad) : new Date(0);
        const dateB = b.fechaCaducidad ? new Date(b.fechaCaducidad) : new Date(0);
        return dateA - dateB;
    });

    // 2. Filtrar
    if (currentFilter === 'search') {
        processedClients = processedClients.filter(client => client.name.toLowerCase().includes(searchTerm));
    } else {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        if (currentFilter === 'soon') {
            const soonLimit = new Date();
            soonLimit.setDate(now.getDate() + 3);
            processedClients = processedClients.filter(client => {
                if (!client.fechaCaducidad) return false;
                const expiryDate = new Date(client.fechaCaducidad);
                const correctedExpiryDate = new Date(expiryDate.getTime() + expiryDate.getTimezoneOffset() * 60000);
                return correctedExpiryDate >= now && correctedExpiryDate <= soonLimit;
            });
        } else if (currentFilter === 'expired') {
            processedClients = processedClients.filter(client => {
                if (!client.fechaCaducidad) return false;
                const expiryDate = new Date(client.fechaCaducidad);
                const correctedExpiryDate = new Date(expiryDate.getTime() + expiryDate.getTimezoneOffset() * 60000);
                return correctedExpiryDate < now;
            });
        }
    }
    
    renderClientList(processedClients);
}

function renderClientList(clientsToRender) {
    const container = document.getElementById('client-list-container');
    container.innerHTML = ''; 

    if (clientsToRender.length === 0) {
        container.innerHTML = '<p id="client-list-placeholder" class="text-center text-gray-500 p-8">No hay clientes que coincidan con el filtro.</p>';
    } else {
        clientsToRender.forEach(client => {
            const card = document.createElement('div');
            // Añadido data-id a la tarjeta y cursor-pointer
            card.className = 'client-card client-card-enter flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl p-4 transition-colors duration-200 hover:bg-gray-100 cursor-pointer';
            card.dataset.id = client.id;
            
            const [dateText, dateColor] = getExpiryDateStatus(client.fechaCaducidad);

            card.innerHTML = `
                <div class="flex-1 mb-4 sm:mb-0">
                    <p class="text-lg font-semibold text-gray-900">${client.name}</p>
                    <p class="text-sm text-gray-600">${client.usuario || 'Sin usuario'} • ${client.aplicacion || 'Sin app'}</p>
                    <p class="text-sm font-medium ${dateColor}">${dateText}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="edit-client-btn action-icon-button" data-id="${client.id}" title="Editar">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button class="delete-client-btn action-icon-button" data-id="${client.id}" data-name="${client.name}" title="Eliminar">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }
}

// --- 9. FUNCIONES DE AYDA (Helpers) ---

function copyTextToClipboard(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.width = "2em";
  textArea.style.height = "2em";
  textArea.style.padding = "0";
  textArea.style.border = "none";
  textArea.style.outline = "none";
  textArea.style.boxShadow = "none";
  textArea.style.background = "transparent";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (!successful) {
        console.error('No se pudo copiar el texto.');
        showAlert('Error', 'No se pudo copiar el texto.');
    }
  } catch (err) {
    console.error('Error al copiar', err);
    showAlert('Error', 'Error al copiar: ' + err.message);
  }

  document.body.removeChild(textArea);
}


function populateEditForm(client) {
    document.getElementById('edit-client-id').value = client.id;
    document.getElementById('edit-client-name').value = client.name || '';
    document.getElementById('edit-client-creation-date').value = client.fechaCreacion || '';
    document.getElementById('edit-client-expiry-date').value = client.fechaCaducidad || '';
    document.getElementById('edit-client-user').value = client.usuario || '';
    document.getElementById('edit-client-password').value = client.password || '';
    document.getElementById('edit-client-device').value = client.dispositivo || '';
    document.getElementById('edit-client-app').value = client.aplicacion || 'Spinning TV';
    document.getElementById('edit-client-phone').value = client.phone ? client.phone.replace(/^\+34/, '') : '';
    document.getElementById('edit-client-notes').value = client.notas || '';

    const recContainer = document.getElementById('edit-recomendaciones-container');
    recContainer.innerHTML = '';
    if (client.recomendaciones && Array.isArray(client.recomendaciones)) {
        client.recomendaciones.forEach(recName => {
            addRecomendacionField('edit-recomendaciones-container', recName);
        });
    }
}

function getExpiryDateStatus(dateString) {
    if (!dateString) return ["Sin fecha de caducidad", "text-gray-500"];
    
    try {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const expiryDate = new Date(dateString);
        const correctedExpiryDate = new Date(expiryDate.getTime() + expiryDate.getTimezoneOffset() * 60000);
        
        const diffTime = correctedExpiryDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (correctedExpiryDate < now) {
            return [`Caducado (hace ${Math.abs(diffDays)} días)`, "text-red-600 font-bold"];
        } else {
            const soonLimit = new Date();
            soonLimit.setDate(now.getDate() + 3); // 3 días
            if (correctedExpiryDate <= soonLimit) {
                return [`Caduca pronto (en ${diffDays} días)`, "text-orange-500 font-semibold"];
            } else {
                return [`Caduca el ${dateString}`, "text-gray-500"];
            }
        }
    } catch(e) {
        return ["Fecha inválida", "text-red-600"];
    }
}

function formatDate(date) {
    if (!date || isNaN(date.getTime())) return ""; 
    return date.toISOString().split('T')[0];
}

function initializeDateFields(creationInput, expiryInput) {
    const today = new Date();
    const expiry = new Date();
    expiry.setMonth(today.getMonth() + 3);
    creationInput.value = formatDate(today);
    expiryInput.value = formatDate(expiry);
}

function updateExpiryDate(creationInput, expiryInput) {
    try {
        const creationDate = new Date(creationInput.value);
        const correctedCreationDate = new Date(creationDate.getTime() + creationDate.getTimezoneOffset() * 60000);
        
        correctedCreationDate.setMonth(correctedCreationDate.getMonth() + 3);
        expiryInput.value = formatDate(correctedCreationDate);
    } catch (e) {
        console.error("Fecha de creación inválida");
    }
}

function addRecomendacionField(containerId, value = '') {
    const container = document.getElementById(containerId);
    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'flex items-center';
    
    fieldWrapper.innerHTML = `
        <input type="text" 
               class="recomendacion-input form-input" 
               list="existing-clients-list" 
               placeholder="Buscar nombre de cliente..."
               value="${value}">
        <button type="button" class="remove-recomendacion-btn">&times;</button>
    `;
    container.appendChild(fieldWrapper);
}

function handleRemoveRecomendacion(e) {
    if (e.target && e.target.classList.contains('remove-recomendacion-btn')) {
        e.target.parentElement.remove();
    }
}

function validateRecomendaciones(containerId) {
    const recInputs = document.querySelectorAll(`#${containerId} .recomendacion-input`);
    const recomendaciones = Array.from(recInputs)
        .map(input => input.value.trim())
        .filter(val => val !== '');

    for (const rec of recomendaciones) {
        if (!allClientNames.includes(rec)) {
            showAlert("Error de validación", `El cliente recomendado "${rec}" no existe. Por favor, corrígelo o elimínalo.`);
            return [false, []];
        }
    }
    return [true, recomendaciones];
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
