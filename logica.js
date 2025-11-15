// --- CONFIG FIREBASE ---
import { initializeApp, setLogLevel } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import {
  getFirestore, collection, addDoc, doc, onSnapshot,
  updateDoc, deleteDoc, query, orderBy, getDocs, setDoc, arrayUnion
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js';

import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
    // Eliminamos signInAnonymously y signInWithCustomToken para forzar el login manual
} from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js';

setLogLevel('debug');

// Variables de entorno globales (Definición robusta con Fallback)
// USAMOS LOS FALLBACKS (tu configuración real para GitHub Pages)
const APP_ID_FALLBACK = 'gestioncli19-app-id'; 
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
// const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; // Ya no se usa

let db, auth;
let cachedList = []; 
let currentRecommendations = []; 
let currentUserId = null;


// --- INICIALIZACIÓN DE FIREBASE (SOLO CONFIGURACIÓN, SIN LOGIN AUTOMÁTICO) ---
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
        // Esta es la única forma de avanzar. Espera un signInWithEmailAndPassword exitoso.
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
        loginErrorMsg.textContent = `Error crítico de Firebase: ${error.code}.`;
    }
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
    };
    
    Object.keys(sections).forEach(key => {
        sections[key].style.display = 'none';
    });
    
    sections[target].style.display = (target === 'tutorial') ? 'block' : 'grid';
    const btn = document.getElementById(`nav-${target}`);
    if(btn) setActive(btn);

    if (target === 'clientes') {
      filterClients(document.getElementById('search-input').value, 'all');
    }
}

function setActive(btn){
  document.querySelectorAll('.menu button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// Oyentes de Navegación 
document.getElementById('nav-dashboard').addEventListener('click', ()=> switchSection('dashboard'));
document.getElementById('nav-clientes').addEventListener('click', ()=> switchSection('clientes'));
document.getElementById('nav-add').addEventListener('click', ()=>{
    switchSection('add');
    setDefaultDates(); 
    document.getElementById('f-telefono').value = '+34'; 
});
document.getElementById('nav-tutorial').addEventListener('click', ()=> switchSection('tutorial'));
document.getElementById('nav-logout').addEventListener('click', async () => {
    await signOut(auth);
    showNotification("Sesión Cerrada", "Has cerrado sesión correctamente.", 'success');
});

// 1. Manejador de Login
const formLogin = document.getElementById('form-login');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginErrorMsg = document.getElementById('login-error-message');

formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorMsg.textContent = 'Iniciando sesión...';

    try {
        await signInWithEmailAndPassword(auth, loginEmail.value, loginPassword.value);
        loginErrorMsg.textContent = '';
        // onAuthStateChanged maneja la transición a la app principal
    } catch (error) {
        let message = "Error de inicio de sesión.";
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            message = "Usuario o contraseña incorrectos.";
        } else if (error.code === 'auth/invalid-email') {
            message = "Formato de email no válido.";
        } else if (error.code === 'auth/network-request-failed') {
             message = "Error de red. Revisa tu conexión.";
        } else if (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') {
             message = "Operación bloqueada. Revisa que el proveedor Email/Password esté habilitado en Firebase.";
        }
        loginErrorMsg.textContent = message;
        console.error("Login error:", error);
    }
});


// --- LÓGICA DE FIRESTORE ---

function getClientCollection() {
    // Usamos la ruta de datos privados del usuario (autenticado por email/pass).
    const uid = currentUserId || 'unauthenticated'; 
    return collection(db, `clients_app/${appId}/users/${uid}/client_data`);
}

function startListeners() {
    // Asegurarse de que el listener solo se inicie si tenemos un ID de usuario logeado
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
        
        if (document.getElementById('section-clientes').style.display !== 'none') {
            filterClients(document.getElementById('search-input').value, 'all');
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
if(document.getElementById('f-creacion')) {
    document.getElementById('f-creacion').addEventListener('change', () => {
        const newCreationDate = document.getElementById('f-creacion').value;
        if (newCreationDate) {
            const newCaducidad = getNewCaducidad(newCreationDate, 3);
            document.getElementById('f-caducidad').value = isoForInput(newCaducidad);
        }
    });
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

document.getElementById('search-input').addEventListener('input', (e) => {
    filterClients(e.target.value, 'all');
});
document.getElementById('stat-3days-link').addEventListener('click', () => {
    currentFilter = 'soon';
    document.getElementById('search-input').value = '';
    switchSection('clientes');
});
document.getElementById('stat-expired-link').addEventListener('click', () => {
    currentFilter = 'expired';
    document.getElementById('search-input').value = '';
    switchSection('clientes');
});


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

    addButton.onclick = () => {
        const name = input.value.trim();
        if (name && !currentRecommendations.includes(name)) {
            currentRecommendations.push(name);
            input.value = '';
            renderRecommendations(currentRecommendations, container, prefix);
        }
    };
};
addRecommendationLogic('f'); 
addRecommendationLogic('e'); 


// --- MODAL Y FORMULARIOS ---

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

document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('modal').classList.remove('show');
    currentRecommendations = [];
});

document.getElementById('form-edit').addEventListener('submit', async e=>{
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
});

document.getElementById('form-add').addEventListener('submit', async e=>{
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
});

document.getElementById('f-reset').addEventListener('click', ()=> {
    document.getElementById('form-add').reset();
    setDefaultDates();
    currentRecommendations = [];
    document.getElementById('f-recommended-clients').innerHTML = '';
    document.getElementById('f-telefono').value = '+34'; 
});

// --- HISTORIAL ---
window.openHistoryModal = async function(id) {
    const item = cachedList.find(i => i.id === id);
    if (!item || !currentUserId) return showNotification("Error", "Cliente o usuario no encontrado.", 'error');

    document.getElementById('history-modal-title').textContent = `Historial de Renovaciones de ${item.nombre}`;

    try {
        const historyCol = collection(db, getClientCollection().id, id, "renovaciones");
        const q = query(historyCol, orderBy("fecha_renovacion", "desc"));
        const snapshot = await getDocs(q);
        const historyList = snapshot.docs.map(doc => doc.data());
        
        renderRenewalHistory(historyList, document.getElementById('history-list'));
        document.getElementById('history-modal').classList.add('show');
    } catch (error) {
        showNotification("Error", "No se pudo cargar el historial.", 'error');
        console.error("Error fetching history:", error);
    }
}

document.getElementById('history-modal-close').addEventListener('click', () => {
    document.getElementById('history-modal').classList.remove('show');
});


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

// Iniciar la aplicación
window.onload = initializeFirebase;
