// Service Worker для Web Push уведомлений
const CACHE_NAME = 'space-cat-chat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/client.js',
  '/notifications.js',
  '/styles.css',
  '/favicon.ico'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Активировать сразу
});

// Активация - очистка старых кэшей
self.addEventListener('activate', (event) => {
  console.log('🔧 Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Получить контроль над страницами сразу
});

// ========== WEB PUSH - ГЛАВНАЯ ЧАСТЬ ==========

// Обработка входящих push-уведомлений (РАБОТАЕТ ДАЖЕ ПРИ ЗАКРЫТОМ БРАУЗЕРЕ!)
self.addEventListener('push', (event) => {
  console.log('📬 Push event received:', event);
  
  let data = { title: 'Space Cat', body: 'Новое уведомление', icon: '/icon-192.png', badge: '/icon-192.png' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.log('📬 Push data parse error:', e);
  }
  
  const options = {
    body: data.body || 'У вас новое уведомление',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Открыть' },
      { action: 'close', title: 'Закрыть' }
    ],
    tag: 'push-notification',
    renotify: true,
    requireInteraction: true
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Space Cat', options)
      .then(() => console.log('✅ Notification shown'))
      .catch((err) => console.error('❌ Notification error:', err))
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  // Пропускаем запросы к API (может быть проблема с CORS когда сервер спит)
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Server sleeping' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кэшированную версию или загружаем из сети
        return response || fetch(event.request).catch(() => {
          // Если не удалось загрузить, возвращаем базовую страницу из кэша
          return caches.match('/');
        });
      })
  );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  
  event.notification.close();

  const { action } = event;
  
  if (action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then((clientList) => {
      // Ищем открытое окно приложения
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          
          // Отправляем данные в приложение
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            data: {
              action: action,
              notification: event.notification.data
            }
          });
          return;
        }
      }
      
      // Если приложение не открыто, открываем новое окно
      if (clients.openWindow) {
        return clients.openWindow('/').then((newClient) => {
          // Даем время на загрузку
          setTimeout(() => {
            if (newClient) {
              newClient.postMessage({
                type: 'NOTIFICATION_CLICK',
                data: {
                  action: action,
                  notification: event.notification.data
                }
              });
            }
          }, 1000);
        });
      }
    })
  );
});