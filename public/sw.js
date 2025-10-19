// sw.js
const CACHE_NAME = 'fire-cat-chat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/client.js',
  '/favicon.ico'
];

self.addEventListener('install', event => {
  console.log('🛠 Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('✅ Service Worker activated');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑 Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Возвращаем кэшированную версию или делаем запрос
        return response || fetch(event.request);
      }
    )
  );
});

self.addEventListener('push', event => {
  console.log('📨 Push message received', event);
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('Error parsing push data:', error);
    data = { title: 'Огненный Кот', body: 'Новое уведомление' };
  }

  const options = {
    body: data.body || 'Новое уведомление',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [],
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Огненный Кот', options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('🔔 Notification clicked', event);
  
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification && event.notification.data ? event.notification.data : {};

  if (action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Ищем открытое окно
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          
          // Отправляем сообщение в основное приложение
          client.postMessage({
            action: action ? 'notification-action' : 'notification-click',
            data: { action, data: notificationData }
          });
          
          return;
        }
      }
      
      // Если окно не найдено, открываем новое
      if (clients.openWindow) {
        return clients.openWindow('/').then(newClient => {
          // Даем время на загрузку и отправляем сообщение
          setTimeout(() => {
            newClient.postMessage({
              action: action ? 'notification-action' : 'notification-click',
              data: { action, data: notificationData }
            });
          }, 1000);
        });
      }
    })
  );
});

self.addEventListener('notificationclose', event => {
  console.log('🔔 Notification closed', event);
});

// Функция для отправки сообщений в основное приложение
function sendMessageToClient(client, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    
    channel.port1.onmessage = event => {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };
    
    client.postMessage(message, [channel.port2]);
  });
}