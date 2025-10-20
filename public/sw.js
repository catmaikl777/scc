// sw.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
const CACHE_NAME = 'fire-cat-chat-v2';

self.addEventListener('install', event => {
  console.log('🛠 Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('✅ Service Worker activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  console.log('📨 Push message received', event);
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('Error parsing push data:', error);
    data = { 
      title: 'Огненный Кот', 
      body: 'Новое уведомление',
      icon: '/favicon.ico'
    };
  }

  const options = {
    body: data.body || 'Новое уведомление',
    icon: data.icon || '/favicon.ico',
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

  const { action, notification } = event;
  
  if (action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ 
      type: 'window',
      includeUncontrolled: true 
    }).then(clientList => {
      // Ищем открытое окно
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          
          // Отправляем сообщение в основное приложение
          client.postMessage({
            action: action ? 'notification-action' : 'notification-click',
            data: { 
              action, 
              notification: notification.data,
              tag: notification.tag 
            }
          });
          return;
        }
      }
      
      // Если окно не найдено, открываем новое
      if (clients.openWindow) {
        return clients.openWindow('/').then(newClient => {
          // Даем время на загрузку
          return new Promise(resolve => {
            setTimeout(() => {
              if (newClient) {
                newClient.postMessage({
                  action: action ? 'notification-action' : 'notification-click',
                  data: { 
                    action, 
                    notification: notification.data,
                    tag: notification.tag 
                  }
                });
              }
              resolve();
            }, 1000);
          });
        });
      }
    })
  );
});