let socket = null;
let currentPage = 'home';

// ВСТАВЬ СВОЙ VAPID ПУБЛИЧНЫЙ КЛЮЧ СЮДА
const VAPID_PUBLIC_KEY = 'BDwHb4ILBEx7NLkfdYXO7l_cO2bptbpexLUYJkosOqMa13zHK1yG5UE-PgzSuNjOHjX3Eh0SGvgybUSrbb2H9FQ';

const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const contentDiv = document.getElementById('app-content');
const enablePushBtn = document.getElementById('enable-push');
const disablePushBtn = document.getElementById('disable-push');
const statusBadge = document.getElementById('status-badge');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; background: ${isError ? '#ff3b30' : '#4285f4'};
    color: white; padding: 0.75rem 1rem; border-radius: 12px; z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function loadNotes() {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  const list = document.getElementById('notes-list');
  if (!list) return;
  
  if (notes.length === 0) {
    list.innerHTML = '<li style="text-align:center; color:#999;">📭 Нет заметок. Добавьте первую!</li>';
    return;
  }
  
  list.innerHTML = notes.map((note, index) => {
    const text = typeof note === 'string' ? note : note.text;
    return `
      <li>
        <span>${escapeHtml(text)}</span>
        <button class="delete-btn" data-index="${index}">🗑 Удалить</button>
      </li>
    `;
  }).join('');
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteNote(parseInt(btn.dataset.index)));
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function addNote(text) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.push({ id: Date.now(), text: text, datetime: new Date().toLocaleString() });
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
  
  if (socket && socket.connected) {
    socket.emit('newTask', { text: text, id: Date.now() });
    console.log('📤 Отправлено через WebSocket:', text);
  }
}

function deleteNote(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.splice(index, 1);
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
}

function initNotes() {
  loadNotes();
  const form = document.getElementById('note-form');
  const input = document.getElementById('note-input');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) {
        addNote(text);
        input.value = '';
      }
    });
  }
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('❌ Push не поддерживается', true);
    return;
  }
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    
    const response = await fetch('http://localhost:3001/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    
    if (response.ok) {
      showToast('✅ Push-уведомления включены');
      enablePushBtn.style.display = 'none';
      disablePushBtn.style.display = 'inline-block';
    }
  } catch (err) {
    console.error(err);
    showToast('❌ Ошибка: ' + err.message, true);
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await fetch('http://localhost:3001/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      await subscription.unsubscribe();
      showToast('🔕 Push-уведомления отключены');
      enablePushBtn.style.display = 'inline-block';
      disablePushBtn.style.display = 'none';
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadContent(page) {
  currentPage = page;
  try {
    const response = await fetch(`/content/${page}.html`);
    const html = await response.text();
    contentDiv.innerHTML = html;
    if (page === 'home') {
      initNotes();
    }
  } catch (err) {
    contentDiv.innerHTML = '<p style="color:red; text-align:center;">❌ Ошибка загрузки</p>';
  }
}

function setActiveButton(activeId) {
  if (homeBtn && aboutBtn) {
    [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
  }
}

function initSocket() {
  if (typeof io === 'undefined') {
    console.error('❌ Socket.IO не загружен!');
    showToast('❌ Socket.IO не загружен. Проверьте интернет', true);
    return;
  }
  
  socket = io('http://localhost:3001');
  
  socket.on('connect', () => {
    console.log('🔌 WebSocket подключён');
    if (statusBadge) {
      statusBadge.innerHTML = '✅ Онлайн • WebSocket ✓';
      statusBadge.style.background = '#34c759';
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 WebSocket отключён');
    if (statusBadge) {
      statusBadge.innerHTML = '⚠️ WebSocket отключён';
      statusBadge.style.background = '#ff9500';
    }
  });
  
  socket.on('taskAdded', (task) => {
    console.log('📨 Получено:', task);
    showToast(`📝 Новая заметка: ${task.text}`);
    if (currentPage === 'home') {
      loadNotes();
    }
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker не поддерживается');
    return false;
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker зарегистрирован');
    
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && enablePushBtn && disablePushBtn) {
      enablePushBtn.style.display = 'none';
      disablePushBtn.style.display = 'inline-block';
    }
    
    return true;
  } catch (err) {
    console.error('❌ Ошибка SW:', err);
    return false;
  }
}

async function init() {
  console.log('🚀 Инициализация...');
  await registerServiceWorker();
  initSocket();
  
  if (homeBtn) homeBtn.onclick = () => { setActiveButton('home-btn'); loadContent('home'); };
  if (aboutBtn) aboutBtn.onclick = () => { setActiveButton('about-btn'); loadContent('about'); };
  if (enablePushBtn) enablePushBtn.onclick = subscribeToPush;
  if (disablePushBtn) disablePushBtn.onclick = unsubscribeFromPush;
  
  await loadContent('home');
}

init();