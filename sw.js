const STATIC_CACHE = 'static-v5';
const DYNAMIC_CACHE = 'dynamic-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/content/home.html',
  '/content/about.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  if (url.pathname.includes('/socket.io/')) return;
  if (url.origin !== location.origin) return;
  
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (url.pathname.startsWith('/content/')) {
          return caches.match('/content/home.html');
        }
        return caches.match('/index.html');
      });
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Новое уведомление', body: '', reminderId: null };
  
  if (event.data) {
    try {
      const parsed = event.data.json();
      data.title = parsed.title || data.title;
      data.body = parsed.body || '';
      data.reminderId = parsed.reminderId || null;
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icons/icon-128x128.png',
    badge: '/icons/icon-48x48.png',
    vibrate: [200, 100, 200],
    data: { reminderId: data.reminderId }
  };
  
  if (data.reminderId) {
    options.actions = [{ action: 'snooze', title: '⏰ Отложить на 5 минут' }];
    options.requireInteraction = true;
  }
  
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const reminderId = notification.data?.reminderId;
  
  notification.close();
  
  if (action === 'snooze' && reminderId) {
    event.waitUntil(
      fetch(`/snooze?reminderId=${reminderId}`, { method: 'POST' })
        .then(() => {
          return self.registration.showNotification('✅ Готово', {
            body: 'Напоминание отложено на 5 минут',
            icon: '/icons/icon-128x128.png'
          });
        })
        .catch(() => {
          return self.registration.showNotification('❌ Ошибка', {
            body: 'Не удалось отложить',
            icon: '/icons/icon-128x128.png'
          });
        })
    );
  } else {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clients => {
        for (let client of clients) {
          if (client.url.includes('/') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow('/');
      })
    );
  }
});