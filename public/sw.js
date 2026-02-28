// Service Worker для простых уведомлений
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кэшированную версию или загружаем из сети
        return response || fetch(event.request);
      }
    )
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