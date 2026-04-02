// Элементы DOM
const form = document.getElementById('note-form');
const input = document.getElementById('note-input');
const list = document.getElementById('notes-list');

// Загрузка заметок из localStorage
function loadNotes() {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  list.innerHTML = notes.map((note, index) => `
    <li>
      <span>${escapeHtml(note)}</span>
      <button class="delete-btn" data-index="${index}">🗑 Удалить</button>
    </li>
  `).join('');

  // Добавляем обработчики удаления
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(btn.dataset.index);
      deleteNote(index);
    });
  });
}

// Функция для защиты от XSS
function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Сохранение новой заметки
function addNote(text) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.push(text);
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
}

// Удаление заметки
function deleteNote(index) {
  const notes = JSON.parse(localStorage.getItem('notes') || '[]');
  notes.splice(index, 1);
  localStorage.setItem('notes', JSON.stringify(notes));
  loadNotes();
}

// Обработка отправки формы
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (text) {
    addNote(text);
    input.value = '';
  }
});

// Первоначальная загрузка
loadNotes();

// Регистрация Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ ServiceWorker зарегистрирован, scope:', registration.scope);
    } catch (err) {
      console.error('❌ Ошибка регистрации ServiceWorker:', err);
    }
  });
} else {
  console.warn('⚠️ Service Worker не поддерживается в этом браузере');
}