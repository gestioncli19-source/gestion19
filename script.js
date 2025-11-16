// --- CONFIG FIREBASE ---
import { initializeApp, setLogLevel } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, onSnapshot,
  updateDoc, deleteDoc, query, orderBy, getDocs, setDoc, arrayUnion
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

setLogLevel('debug');

// Variables de entorno globales (Definición robusta con Fallback)
const APP_ID_FALLBACK = 'gestioncli19-fallback-id-v2'; 
const FIREBASE_CONFIG_FALLBACK = {
    apiKey: "AIzaSyCA2fZvN8WVKWwEDL0z694C2o5190OMhq8",
    authDomain: "gestioncandy-b9356.firebaseapp.com",
    projectId: "gestioncandy-b9356",
    storageBucket: "gestioncandy-b9356.firebasestorage.app",
    messagingSenderId: "869982852654",
    appId: "1:869982852654:web:ac450321a746e62365f1bf"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : APP_ID_FALLBACK;
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config !== '{}' 
    ? JSON.parse(__firebase_config) 
    : FIREBASE_CONFIG_FALLBACK;

let db, auth;
let cachedList = []; 
let currentRecommendations = []; 
let currentUserId = null;
let currentFilter = 'all';


// --- INICIALIZACIÓN DE FIREBASE (SOLO CONFIGURACIÓN) ---
async function initializeFirebase() {
    console.log("Iniciando Firebase con ID de App:", appId);

    if (!firebaseConfig.apiKey) {
        console.error("Firebase configuration is missing or invalid.");
        document.getElementById('section-login').innerHTML = '<div class="login-box" style="text-align:center;"><h2 style="color:var(--red);">Error de Configuración</h2><p>Falta la clave API de Firebase.</p></div>';
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app); 
        
        // Listener de Estado de Autenticación
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
                handleAuthStatus(true);
                startListeners();
            } else {
                currentUserId = null;
                handleAuthStatus(false);
            }
        });

    } catch (error) {
        console.error("Error durante la inicialización de Firebase:", error);
        document.getElementById('login-error-message').textContent = `Error crítico de Firebase: ${error.code}.`;
    }
}


// --- CONFIGURACIÓN DE OYENTES DE EVENTOS ---

function setupEventListeners() {
    
    // --- MANEJADOR DE LOGIN ---
    const formLogin = document.getElementById('form-login');
    const loginErrorMsg = document.getElementById('login-error-message');

    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginErrorMsg.textContent = 'Iniciando sesión...';

            if (!auth) {
                loginErrorMsg.textContent = 'Error: Firebase no está inicializado. Intenta recargar.';
                return;
            }
            
            const loginEmail = document.getElementById('login-email');
            const loginPassword = document.getElementById('login-password');

            try {
                await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
                loginErrorMsg.textContent = '';
            } catch (error) {
                let message = "Error de inicio de sesión.";
                
                switch (error.code) {
                    case 'auth/wrong-password':
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential':
                        message = "Usuario o contraseña incorrectos.";
                        break;
                    case 'auth/operation-not-allowed':
                        message = "ERROR CRÍTICO: El proveedor Email/Password NO está habilitado en Firebase Console.";
                        break;
                    default:
                        message = `Error de autenticación: ${error.code}`;
                }
                
                loginErrorMsg.textContent = message;
                console.error("Login error:", error);
            }
        });
    }

    // --- OYENTES DE NAVEGACIÓN Y DASHBOARD ---
    document.getElementById('nav-dashboard')?.addEventListener('click', ()=> switchSection('dashboard'));
    document.getElementById('nav-clientes')?.addEventListener('click', ()=> switchSection('clientes'));
    document.getElementById('nav-add')?.addEventListener('click', ()=>{
        switchSection('add');
        setDefaultDates(); 
        document.getElementById('f-telefono').value = '+34'; 
    });
    document.getElementById('nav-settings')?.addEventListener('click', ()=> switchSection('settings')); 

    document.getElementById('search-input')?.addEventListener('input', (e) => {
        filterClients(e.target.value, 'all');
    });
    document.getElementById('stat-3days-link')?.addEventListener('click', () => {
        currentFilter = 'soon';
        document.getElementById('search-input').value = '';
        switchSection('clientes');
    });
    document.getElementById('stat-expired-link')?.addEventListener('click', () => {
        currentFilter = 'expired';
        document.getElementById('search-input').value = '';
        switchSection('clientes');
    });

    // --- Opciones del Menú de Ajustes ---
    document.getElementById('btn-export-csv')?.addEventListener('click', () => exportCSV());
    document.getElementById('btn-logout-settings')?.addEventListener('click', async () => {
        await signOut(auth);
        showNotification("Sesión Cerrada", "Has cerrado sesión correctamente.", 'success');
    });
    document.getElementById('btn-import-csv')?.addEventListener('click', () => handleImportClick());
    document.getElementById('nav-tutorial')?.addEventListener('click', ()=> switchSection('tutorial'));
    
    // --- OYENTES DE MODALES Y FORMULARIOS ---
    document.getElementById('modal-cancel')?.addEventListener('click', () => {
        document.getElementById('modal').classList.remove('show');
        currentRecommendations = [];
    });
    document.getElementById('history-modal-close')?.addEventListener('click', () => {
        document.getElementById('history-modal').classList.remove('show');
    });
    
    // Llamadas a la lógica de adición de recomendaciones (para ambos formularios)
    addRecommendationLogic('f'); 
    addRecommendationLogic('e'); 
    
    // Manejadores de Submit y Reset
    document.getElementById('form-edit')?.addEventListener('submit', handleEditSubmit);
    document.getElementById('form-add')?.addEventListener('submit', handleAddSubmit);
    document.getElementById('f-reset')?.addEventListener('click', handleResetClick);
    document.getElementById('f-creacion')?.addEventListener('change', handleCreationDateChange);
}


// --- MANEJADORES DE VISTA ---
function handleAuthStatus(isLoggedIn) {
    if (isLoggedIn) {
        document.getElementById('section-login').classList.remove('show');
        document.getElementById('app-container').style.display = 'block';
        switchSection('dashboard');
    } else {
        document.getElementById('section-login').classList.add('show');
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('login-error-message').textContent = '';
    }
}

function switchSection(target) {
    const sections = {
        'dashboard': document.getElementById('section-dashboard'),
        'clientes': document.getElementById('section-clientes'),
        'add': document.getElementById('section-add'),
        'tutorial': document.getElementById('section-tutorial'),
        'settings': document.getElementById('section-settings'), 
    };
    
    document.querySelectorAll('main section').forEach(section => {
        section.style.display = 'none';
    });
    
    sections[target].style.display = (target === 'tutorial' || target === 'settings') ? 'block' : 'grid';
    
    // Desactivar todos los botones de navegación
    document.querySelectorAll('.menu button').forEach(b=>b.classList.remove('active'));
    
    // Activar el botón correspondiente
    let targetId = `nav-${target}`;
    if (target === 'tutorial' || target === 'settings') {
        // Para Tutorial y Ajustes, activamos el botón de Ajustes (Engranaje)
        document.getElementById('nav-settings').classList.add('active');
    } else {
        // Para Dashboard, Clientes y Añadir, activamos su propio botón
        document.getElementById(targetId)?.classList.add('active');
    }

    if (target === 'clientes') {
      filterClients(document.getElementById('search-input').value, currentFilter);
    }
}


// --- LÓGICA DE FIRESTORE ---

function getClientCollection() {
    const uid = currentUserId || 'unauthenticated'; 
    return collection(db, `clients_app/${appId}/users/${uid}/client_data`);
}

function startListeners() {
    if (!currentUserId) {
        console.log("Esperando autenticación para iniciar listeners...");
        return;
    }

    const col = getClientCollection();
    onSnapshot(col, (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        cachedList = list;
        renderDashboard(list);
        updateStats(list);
        
        if (document.getElementById('section-clientes')?.style.display !== 'none') {
            filterClients(document.getElementById('search-input').value, currentFilter);
        }
    }, (error) => {
        console.error("Error fetching data: ", error);
        showNotification("Error de Datos", "No se pudo cargar la lista. Revisa las reglas de Firestore.", 'error');
    });
}

// --- UTILITIES (Date, Notifications, etc.) ---

function getNewCaducidad(currentDate, months) {
    let date = currentDate ? new Date(currentDate) : new Date();
    let newDate = new Date(date);
    newDate.setMonth(newDate.getMonth() + months);
    if (newDate.getDate() < date.getDate()) {
        newDate.setDate(0); 
    }
    return newDate.toISOString();
}

function formatDate(d){
  if(!d) return '-';
  if(d.toDate) d = d.toDate();
  const dt = new Date(d);
  if(isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString();
}

function isoForInput(d){
  if(!d) return '';
  if(d.toDate) d = d.toDate();
  const t = new Date(d);
  if(isNaN(t.getTime())) return '';
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth()+1).padStart(2,'0');
  const dd = String(t.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function showNotification(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<strong>${title}</strong><p>${message}</p>`;
  
  const notificationsContainer = document.getElementById('notifications-container');
  notificationsContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}

function setDefaultDates() {
    const today = new Date();
    const caducidad3Months = getNewCaducidad(today, 3);

    document.getElementById('f-creacion').value = isoForInput(today);
    document.getElementById('f-caducidad').value = isoForInput(caducidad3Months);
}

function handleCreationDateChange() {
    const newCreationDate = document.getElementById('f-creacion').value;
    if (newCreationDate) {
        const newCaducidad = getNewCaducidad(newCreationDate, 3);
        document.getElementById('f-caducidad').value = isoForInput(newCaducidad);
    }
}


// --- Dashboard Logic ---
function getExpiryStatus(isoDate) {
    if (!isoDate) return '';
    if(isoDate.toDate) isoDate = isoDate.toDate(); 
    const date = new Date(isoDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'status-red';
    if (diffDays <= 7) return 'status-yellow';
    return 'status-green';
}

function getSoonToExpire(list) {
    const now = new Date();
    now.setHours(0,0,0,0);
    const limit = new Date(now);
    limit.setDate(limit.getDate() + 3);
    limit.setHours(23,59,59,999);
    return list.filter(i => {
      if(!i.caducidad) return false;
      let d = i.caducidad.toDate ? i.caducidad.toDate() : new Date(i.caducidad);
      return d >= now && d <= limit;
    });
}

function getExpired(list) {
    const now = new Date();
    now.setHours(0,0,0,0);
    return list.filter(i => {
        if(!i.caducidad) return false;
        let d = i.caducidad.toDate ? i.caducidad.toDate() : new Date(i.caducidad);
        return d < now; 
    });
}

function updateStats(list) {
    document.getElementById('stat-total').textContent = list.length;
    const soon = getSoonToExpire(list);
    document.getElementById('stat-today-3days').textContent = soon.length;
    const expired = getExpired(list);
    document.getElementById('stat-expired').textContent = expired.length;
}

function renderDashboard(list){
  const soon = getSoonToExpire(list);

  const dashboardSoonExp = document.getElementById('dashboard-soon-exp');
  
  const header = `<p class="meta" style="grid-column: 1 / -1; margin-bottom: 0; color: var(--accent); font-weight: 600;">Clientes que caducan en los próximos 3 días (${soon.length}):</p>`;
    
  let cardsContainerHtml = '';
  
  if (soon.length === 0) {
      cardsContainerHtml = '<p style="color: var(--muted); margin: 10px 0;">No hay clientes próximos a caducar.</p>';
  } else {
      let cardsHtml = '';
      soon.forEach(item => {
        const isRenewing = item.renovara === true ? 'checked' : '';
        
        const dashboardCardStyle = `background: #2a1e12; border: 1px solid var(--yellow);`; 
        
        const whatsappBtn = item.telefono && item.telefono.length > 5 ? 
            `<button class="btn whatsapp-alert" onclick="sendWhatsappAlert('${item.id}')">¡Avisar! 💬</button>` : '';

        cardsHtml += `
            <div class="card exp-card status-red" style="flex-shrink: 0; min-width: 250px; ${dashboardCardStyle}">
              <h4>${item.nombre}</h4>
              <div class="meta" style="color: var(--yellow); font-weight: 600;">Caduca: ${formatDate(item.caducidad)}</div>
              <div class="flex-end">
                <label for="renew-${item.id}">Renovará</label>
                <input type="checkbox" id="renew-${item.id}" data-id="${item.id}" ${isRenewing} onclick="toggleRenovara(this)" />
              </div>
              <div class="btns">
                <button class="btn renew" onclick="renewItem('${item.id}')">Renovar</button>
                <button class="btn free-month" onclick="addFreeMonth('${item.id}')">Mes gratis</button>
                <button class="btn copy" onclick="copyPassword('${item.id}')">Copiar</button>
                ${whatsappBtn}
              </div>
            </div>
        `;
      });
      
      cardsContainerHtml = `<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 10px; margin-top: 10px;">${cardsHtml}</div>`;
  }
  
  dashboardSoonExp.innerHTML = header + cardsContainerHtml;
}

window.toggleRenovara = async function(checkbox) {
    const id = checkbox.dataset.id;
    const newValue = checkbox.checked;
    if (!currentUserId) return showNotification("Error", "Usuario no autenticado.", 'error');

    try {
        await updateDoc(doc(db, getClientCollection().id, id), { renovara: newValue });
        showNotification("Estado Actualizado", `Estado de 'Renovará' cambiado a ${newValue ? 'Sí' : 'No'}.`, 'success');
    } catch (error) {
        showNotification("Error", "No se pudo actualizar el estado de 'Renovará'.", 'error');
        console.error("Error toggling renovara:", error);
    }
}


// --- CRUD Functions ---
window.copyPassword = function(id) {
    const item = cachedList.find(i => i.id === id);
    if (!item) return;

    const textToCopy = 
        `Usuario: ${item.usuario || '-'}\n` +
        `Contraseña: ${item.contrasena || '-'}\n` +
        `Aplicación: ${item.aplicacion || '-'}\n` +
        `Caducidad: ${formatDate(item.caducidad)}`;
    
    const textArea = document.createElement("textarea");
    textArea.value = textToCopy;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showNotification("Copiado", "Usuario, Contraseña, Aplicación y Caducidad copiados.", 'success');
    } catch (err) {
        showNotification("Error", "No se pudo copiar el texto.", 'error');
    }
    document.body.removeChild(textArea);
}

window.addFreeMonth = async function(id) {
    const item = cachedList.find(i => i.id === id);
    if(!item || !currentUserId) return showNotification("Error", "Cliente o usuario no encontrado.", 'error');

    const recommendationsCount = item.recomendaciones ? item.recomendaciones.length : 0;
    if (recommendationsCount < 3) {
        showNotification("Acción Bloqueada", `Se requieren al menos 3 recomendaciones (${recommendationsCount} actuales) para el mes gratis.`, 'error');
        return; 
    }

    const oldCaducidad = item.caducidad;
    const newCaducidad = getNewCaducidad(oldCaducidad, 1); 

    try {
        await updateDoc(doc(db, getClientCollection().id, id), {
            caducidad: newCaducidad
        });

        await addDoc(collection(db, getClientCollection().id, id, "renovaciones"), {
            fecha_renovacion: new Date().toISOString(),
            caducidad_anterior: oldCaducidad || 'Fecha no registrada',
            nueva_caducidad: newCaducidad,
            tipo_accion: 'Mes Gratis', 
            usuario: auth.currentUser ? auth.currentUser.email : 'Usuario Desconocido'
        });

        showNotification("Mes Gratis Añadido", `Cliente ${item.nombre} extendido por 1 mes.`, 'success');
    } catch (error) {
        showNotification("Error", "No se pudo añadir el mes gratis. (Revisa reglas de Firestore)", 'error');
        console.error("Error adding free month:", error);
    }
}

window.renewItem = async function(id){
  const item = cachedList.find(i => i.id === id);
  if(!item || !currentUserId) return showNotification("Error", "Cliente o usuario no encontrado.", 'error');

  const oldCaducidad = item.caducidad;
  const newCaducidad = getNewCaducidad(oldCaducidad, 3); 

  try {
      await updateDoc(doc(db, getClientCollection().id, id), {
        caducidad: newCaducidad
      });

      await addDoc(collection(db, getClientCollection().id, id, "renovaciones"), {
          fecha_renovacion: new Date().toISOString(),
          caducidad_anterior: oldCaducidad || 'Fecha no registrada',
          nueva_caducidad: newCaducidad,
          tipo_accion: 'Renovación Normal (+3 meses)',
          usuario: auth.currentUser ? auth.currentUser.email : 'Usuario Desconocido'
      });

      showNotification("Renovación Exitosa", "Cliente renovado por 3 meses y registro guardado.", 'success');
  } catch (error) {
      showNotification("Error de Renovación", "No se pudo renovar el cliente.", 'error');
      console.error("Error renewing item:", error);
  }
}

// RENDERIZADO DE CLIENTES EN SECCIÓN CLIENTES 
const cardColors = ['card-color-1', 'card-color-2', 'card-color-3', 'card-color-4', 'card-color-5'];
function filterClients(searchTerm = "", filter = 'all') {
    const normalizedSearch = searchTerm.toLowerCase();
    let filteredList = cachedList;
    
    if (filter === 'soon') {
        filteredList = getSoonToExpire(cachedList);
    } else if (filter === 'expired') {
        filteredList = getExpired(cachedList);
    }

    const searchResults = filteredList.filter(item => {
        return item.nombre?.toLowerCase().includes(normalizedSearch) ||
               item.usuario?.toLowerCase().includes(normalizedSearch) ||
               item.aplicacion?.toLowerCase().includes(normalizedSearch);
    });

    renderClients(searchResults);
}


function renderClients(list){
  const clientsGrid = document.getElementById('clients-grid');
  clientsGrid.innerHTML = "";

  if (list.length === 0) {
      clientsGrid.innerHTML = "<p style='color: var(--muted); grid-column: 1 / -1; text-align: center;'>No se encontraron clientes.</p>";
      return;
  }

  list.forEach((item, index) => {
    let recommendationsHTML = '';
    if (item.recomendaciones && item.recomendaciones.length > 0) {
        recommendationsHTML = `<div class="meta" style="margin-top: 8px;">Recomendaciones (${item.recomendaciones.length}): ${item.recomendaciones.join(', ')}</div>`;
    }
    
    const statusClass = getExpiryStatus(item.caducidad);
    const colorClass = cardColors[index % cardColors.length];

    const whatsappBtn = item.telefono && item.telefono.length > 5 ? 
        `<button class="btn whatsapp-alert" onclick="sendWhatsappAlert('${item.id}')">Avisar 💬</button>` : '';

    const card = document.createElement('div');
    card.className = `card ${statusClass} ${colorClass}`;
    card.innerHTML = `
      <h4>${item.nombre}</h4>
      <div class="meta">Teléfono: ${item.telefono || "-"}</div>
      <div class="meta">App: ${item.aplicacion || "-"}</div>
      <div class="meta">Creación: ${formatDate(item.creacion)}</div>
      <div class="meta">Caduca: ${formatDate(item.caducidad)}</div>
      ${recommendationsHTML}

      <div class="btns">
        <button class="btn edit" onclick="openEdit('${item.id}')">Editar</button>
        <button class="btn renew" onclick="renewItem('${item.id}')">Renovar</button>
        <button class="btn free-month" onclick="addFreeMonth('${item.id}')">Mes gratis</button>
        <button class="btn copy" onclick="copyPassword('${item.id}')">Copiar</button>
        ${whatsappBtn}
        <button class="btn delete" onclick="deleteItem('${item.id}')">Eliminar</button>
      </div>
    `;
    clientsGrid.appendChild(card);
  });
}

window.sendWhatsappAlert = function(id) {
    const item = cachedList.find(i => i.id === id);
    if (!item || !item.telefono || item.telefono.length < 6) {
        showNotification("Error", "Teléfono no válido o faltante.", 'error');
        return;
    }
    const message = encodeURIComponent(`Hola ${item.nombre || ''}. Tu suscripción va a caducar pronto, ¿vas a querer renovar? 🙂`);
    const phone = item.telefono.replace(/\s/g, '').replace('+', ''); 
    const whatsappUrl = `https://wa.me/${phone}?text=${message}`;
    window.open(whatsappUrl, '_blank');
    showNotification("Alerta enviada", `Se abrió WhatsApp para enviar mensaje a ${item.nombre}.`, 'success');
}


window.deleteItem = async function(id) {
    if (!confirm("¿Estás seguro de que quieres eliminar este cliente?")) return;
    if (!currentUserId) return showNotification("Error", "Usuario no autenticado.", 'error');

    try {
        await deleteDoc(doc(db, getClientCollection().id, id));
        showNotification("Eliminado", "Cliente eliminado con éxito.", 'success');
    } catch (error) {
        showNotification("Error", "No se pudo eliminar el cliente. (Revisa reglas de Firestore)", 'error');
        console.error("Error deleting item:", error);
    }
}

// --- Lógica de Recomendaciones (para ambos formularios) ---
function renderRecommendations(recommendations, targetElement, prefix) {
    targetElement.innerHTML = '';
    recommendations.forEach((rec, index) => {
        const tag = document.createElement('div');
        tag.className = 'recommendation-tag';
        tag.innerHTML = `${rec} <button type="button" onclick="removeRecommendation('${prefix}', ${index})">x</button>`;
        targetElement.appendChild(tag);
    });
}
window.removeRecommendation = function(prefix, index) {
    currentRecommendations.splice(index, 1);
    renderRecommendations(currentRecommendations, document.getElementById(`${prefix}-recommended-clients`), prefix);
}

const addRecommendationLogic = (prefix) => {
    const input = document.getElementById(`${prefix}-new-recommendation`);
    const container = document.getElementById(`${prefix}-recommended-clients`);
    const addButton = document.getElementById(`${prefix}-add-recommendation-btn`);

    if (input && addButton) { // Verificación añadida
        addButton.onclick = () => {
            const name = input.value.trim();
            if (name && !currentRecommendations.includes(name)) {
                currentRecommendations.push(name);
                input.value = '';
                renderRecommendations(currentRecommendations, container, prefix);
            }
        };
    }
};


// --- CRUD Handlers ---

async function handleEditSubmit(e){
  e.preventDefault();
  const id = document.getElementById('modal').getAttribute('data-id');
  if(!id || !currentUserId) return showNotification("Error", "Usuario o ID no válido.", 'error');

  const data = {
    nombre: document.getElementById('e-nombre').value,
    telefono: document.getElementById('e-telefono').value, 
    creacion: document.getElementById('e-creacion').value,
    caducidad: document.getElementById('e-caducidad').value,
    usuario: document.getElementById('e-usuario').value,
    contrasena: document.getElementById('e-contrasena').value,
    dispositivo: document.getElementById('e-dispositivo').value,
    aplicacion: document.getElementById('e-aplicacion').value,
    recomendaciones: currentRecommendations 
  };

  try {
      await updateDoc(doc(db, getClientCollection().id, id), data);
      document.getElementById('modal').classList.remove('show');
      showNotification("Guardado", `Cambios en cliente ${data.nombre} guardados.`, 'success');
      currentRecommendations = [];
  } catch (error) {
      showNotification("Error", "No se pudieron guardar los cambios. (Revisa reglas de Firestore)", 'error');
      console.error("Error updating item:", error);
  }
}

async function handleAddSubmit(e){
  e.preventDefault();
  if (!currentUserId) return showNotification("Error", "Usuario no autenticado.", 'error');


  const data = {
    nombre: document.getElementById('f-nombre').value,
    telefono: document.getElementById('f-telefono').value, 
    creacion: document.getElementById('f-creacion').value,
    caducidad: document.getElementById('f-caducidad').value,
    usuario: document.getElementById('f-usuario').value,
    contrasena: document.getElementById('f-contrasena').value,
    dispositivo: document.getElementById('f-dispositivo').value,
    aplicacion: document.getElementById('f-aplicacion').value,
    recomendaciones: currentRecommendations, 
    renovara: false
  };

  try {
      const col = getClientCollection();
      const docRef = await addDoc(col, data);
      
      const historyCol = collection(db, col.id, docRef.id, "renovaciones");
      await addDoc(historyCol, {
          fecha_renovacion: new Date().toISOString(),
          caducidad_anterior: 'Nuevo Cliente',
          nueva_caducidad: data.caducidad,
          tipo_accion: 'Creación (+3 meses)', 
          usuario: auth.currentUser ? auth.currentUser.email : 'Usuario Desconocido'
      });
      
      showNotification("Cliente Creado", `El cliente ${data.nombre} ha sido añadido con éxito.`, 'success');
      
      document.getElementById('form-add').reset();
      setDefaultDates(); 
      currentRecommendations = [];
      document.getElementById('f-recommended-clients').innerHTML = '';
      document.getElementById('f-telefono').value = '+34'; 
  } catch (error) {
      showNotification("Error de Creación", "No se pudo añadir el nuevo cliente. (Revisa reglas de Firestore)", 'error');
      console.error("Error adding item:", error);
  }
}

function handleResetClick() {
    document.getElementById('form-add').reset();
    setDefaultDates();
    currentRecommendations = [];
    document.getElementById('f-recommended-clients').innerHTML = '';
    document.getElementById('f-telefono').value = '+34'; 
}


// --- MODAL Y FUNCIONES VARIAS ---

window.openEdit = function(id){
    const item = cachedList.find(i => i.id === id);
    if(!item) return;

    currentRecommendations = [...(item.recomendaciones || [])];
    renderRecommendations(currentRecommendations, document.getElementById('e-recommended-clients'), 'e');

    document.getElementById('e-nombre').value = item.nombre;
    document.getElementById('e-telefono').value = item.telefono || "+34"; 
    document.getElementById('e-creacion').value = isoForInput(item.creacion);
    document.getElementById('e-caducidad').value = isoForInput(item.caducidad);
    document.getElementById('e-usuario').value = item.usuario || "";
    document.getElementById('e-contrasena').value = item.contrasena || "";
    document.getElementById('e-dispositivo').value = item.dispositivo || "";
    document.getElementById('e-aplicacion').value = item.aplicacion || ""; 

    document.getElementById('modal').setAttribute('data-id', id);
    document.getElementById('btn-history-open').onclick = () => openHistoryModal(id);
    document.getElementById('modal').classList.add('show');
};

// --- HISTORIAL ---
window.openHistoryModal = async function(id) {
    const item = cachedList.find(i => i.id === id);
    if (!item || !currentUserId) return showNotification("Error", "Cliente o usuario no encontrado.", 'error');

    document.getElementById('history-modal-title').textContent = `Historial de Renovaciones de ${item.nombre}`;

    try {
        const historyCol = collection(db, getClientCollection().id, id, "renovaciones");
        const snapshot = await getDocs(historyCol);
        
        let historyList = snapshot.docs.map(doc => doc.data());
        
        historyList.sort((a, b) => {
            return new Date(b.fecha_renovacion) - new Date(a.fecha_renovacion);
        });
        
        renderRenewalHistory(historyList, document.getElementById('history-list'));
        document.getElementById('history-modal').classList.add('show');
    } catch (error) {
        showNotification("Error", "No se pudo cargar el historial.", 'error');
        console.error("Error fetching history:", error);
    }
}

function renderRenewalHistory(historyList, targetDiv) {
    targetDiv.innerHTML = '';
    if (historyList.length === 0) {
        targetDiv.innerHTML = '<p style="text-align:center; color: var(--muted);">No se encontraron registros de renovación.</p>';
        return;
    }

    let html = '<div style="display:grid; gap:10px;">';
    historyList.forEach(rec => {
        const actionType = rec.tipo_accion || 'Renovación Manual';
        const color = actionType.includes('Gratis') ? 'var(--yellow)' : actionType.includes('Creación') ? 'var(--green)' : 'var(--accent)';

        html += `
            <div class="stat" style="border-left: 4px solid ${color}; padding:10px;">
                <strong>${actionType}</strong>
                <div style="font-size: 13px; color: var(--muted); margin-top: 5px;">
                     Fecha de Registro: ${formatDate(rec.fecha_renovacion)}<br/>
                     Caducidad anterior: ${formatDate(rec.caducidad_anterior)}<br/>
                     Nueva Caducidad: ${formatDate(rec.nueva_caducidad)}
                     ${rec.usuario ? `<br/>Usuario: ${rec.usuario.split('@')[0]}` : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    targetDiv.innerHTML = html;
}

// --- AJUSTES: Lógica de Importar/Exportar ---

/**
 * Función para analizar datos CSV y convertirlos en una lista de objetos, 
 * esperando SOLO los campos mínimos: Nombre,Usuario,Contrasena,Caducidad.
 * Se configura para usar PUNTO Y COMA (;) como separador.
 * @param {string} csvText Datos CSV como texto.
 * @returns {Array} Lista de objetos cliente.
 */
function parseCSV(csvText) {
    // Definimos el separador como PUNTO Y COMA (;)
    const SEPARATOR = ';';
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Cabeceras esperadas: SOLO los 4 campos solicitados
    // NOTA: Normalizamos a mayúsculas para la comparación, pero aceptamos minúsculas del archivo.
    const expectedHeaders = ["Nombre", "Usuario", "Contrasena", "Caducidad"];
    
    // Obtenemos las cabeceras del archivo y las normalizamos (eliminando comillas y espacios)
    const headers = lines[0].split(SEPARATOR).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    
    // Comprobamos si las cabeceras del archivo coinciden con las esperadas (ignorando mayúsculas)
    const normalizedExpectedHeaders = expectedHeaders.map(h => h.toLowerCase());
    
    // Simplificamos la verificación uniendo los arrays con un separador común
    if (headers.join(',') !== normalizedExpectedHeaders.join(',')) {
        console.error("CSV Headers mismatch. Expected:", normalizedExpectedHeaders.join(','), "Got:", headers.join(','));
        showNotification("Error de CSV", `Las cabeceras del archivo NO coinciden con el formato mínimo esperado. Separador: ${SEPARATOR}. Cabeceras esperadas: ${expectedHeaders.join(SEPARATOR)}.`, 'error');
        return [];
    }
    
    // Regex para manejar campos entrecomillados que puedan contener el separador
    const CSV_REGEX = new RegExp(`(?:"((?:[^"]|"")*)"|([^${SEPARATOR}]+))(${SEPARATOR}|$)`, 'g');

    const clients = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let values = [];
        let match;
        
        while ((match = CSV_REGEX.exec(line)) !== null) {
            // match[1] es el grupo de campo entre comillas, match[2] es el campo sin comillas
            const value = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
            values.push(value.trim());
        }

        if (values.length !== expectedHeaders.length) {
             console.warn(`Saltando línea ${i + 1} por número incorrecto de campos. Esperado ${expectedHeaders.length}, encontrado ${values.length}. Línea: ${line}`);
             continue;
        }

        const client = {};
        expectedHeaders.forEach((key, index) => {
            // Usamos la cabecera original (Nombre, Usuario, etc.) para el mapeo
            const normalizedKey = key.toLowerCase();
            client[normalizedKey] = values[index];
        });

        // Asignar valores predeterminados para campos faltantes
        const now = new Date();
        const defaultCaducidad = client.caducidad && !isNaN(new Date(client.caducidad).getTime()) 
                                 ? new Date(client.caducidad).toISOString() 
                                 : getNewCaducidad(now, 3);
        
        clients.push({
            nombre: client.nombre,
            usuario: client.usuario,
            contrasena: client.contrasena,
            caducidad: defaultCaducidad,
            telefono: '+34',
            aplicacion: 'Spinning TV', // Valor por defecto
            dispositivo: 'Importado',
            creacion: now.toISOString(),
            recomendaciones: [],
            renovara: false
        });
    }
    return clients;
}


// 1. Exportar CSV (función separada para usar en el botón de ajustes)
function exportCSV() {
    if (!currentUserId) return showNotification("Error", "Usuario no autenticado.", 'error');

    // Definimos el separador para la exportación como PUNTO Y COMA (;)
    const EXPORT_SEPARATOR = ';';
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Cabecera que se espera para la Importación (los 4 campos esenciales)
    csvContent += "Nombre;Usuario;Contrasena;Caducidad\n";

    cachedList.forEach(item => {
        // Función para limpiar y entrecomillar el valor usando el separador de exportación
        const cleanAndQuote = (val) => {
            let str = String(val || '');
            // Si el valor contiene el separador o comillas, lo encerramos en comillas
            if (str.includes(EXPORT_SEPARATOR) || str.includes('"')) {
                str = str.replace(/"/g, '""'); // Escapar comillas dobles
                return `"${str}"`;
            }
            return str;
        };

        const row = [
            cleanAndQuote(item.nombre),
            cleanAndQuote(item.usuario),
            cleanAndQuote(item.contrasena),
            cleanAndQuote(formatDate(item.caducidad)) // Exportamos la fecha en formato legible
        ];
        
        csvContent += row.join(EXPORT_SEPARATOR) + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "gestor_clientes_export_simple.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Exportado", "Se ha descargado el archivo CSV simple (separado por punto y coma).", 'success');
}

// 2. Importar CSV (solo activa el input de archivo)
window.handleImportClick = function() {
    if (!currentUserId) return showNotification("Error", "Usuario no autenticado.", 'error');
    document.getElementById('file-import-csv').click();
    showNotification("Advertencia", "Formato esperado para importar: Nombre;Usuario;Contrasena;Caducidad (separado por punto y coma).", 'warning');
}

// Lógica de importación completa
document.getElementById('file-import-csv')?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const csvData = e.target.result;
            const clientsToImport = parseCSV(csvData);
            
            if (clientsToImport.length === 0) {
                showNotification("Importación Fallida", "El archivo CSV está vacío o tiene un formato incorrecto. Ningún cliente importado.", 'error');
                event.target.value = ''; // Limpiar el input
                return;
            }

            let successCount = 0;
            let errorCount = 0;
            const collectionRef = getClientCollection();

            showNotification("Importando...", `Iniciando importación de ${clientsToImport.length} clientes. Esto puede tardar.`, 'success');

            for (const client of clientsToImport) {
                try {
                    // Convertir la fecha de caducidad (que ahora está en ISO string) a objeto Date
                    const importData = {
                        ...client,
                        caducidad: new Date(client.caducidad),
                        creacion: new Date(client.creacion)
                    };

                    const docRef = await addDoc(collectionRef, importData);

                    // Registrar en el historial de creación
                    const historyCol = collection(db, collectionRef.id, docRef.id, "renovaciones");
                    await addDoc(historyCol, {
                        fecha_renovacion: new Date().toISOString(),
                        caducidad_anterior: 'Importado',
                        nueva_caducidad: importData.caducidad.toISOString(),
                        tipo_accion: 'Importación CSV',
                        usuario: auth.currentUser ? auth.currentUser.email : 'Usuario Desconocido'
                    });

                    successCount++;
                } catch (error) {
                    errorCount++;
                    // *** ESTO ES LO QUE ESTÁ FALLANDO POR REGLAS DE SEGURIDAD ***
                    console.error("Error al importar cliente:", client, error); 
                }
            }

            if (errorCount === 0) {
                 showNotification("Importación Finalizada", `Éxito: Se importaron ${successCount} clientes.`, 'success');
            } else {
                 showNotification("Importación con Errores", `Completado: ${successCount} importados, ${errorCount} fallaron (revisa la consola para detalles).`, 'warning');
            }
            event.target.value = ''; // Limpiar el input
        };
        reader.readAsText(file);
    }
});


// Iniciar la aplicación
window.onload = initializeFirebase;
document.addEventListener('DOMContentLoaded', setupEventListeners);
