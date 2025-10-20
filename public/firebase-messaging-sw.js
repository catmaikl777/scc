// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.0/firebase-messaging-compat.js');

// Firebase конфигурация - ЗАМЕНИТЕ на вашу из Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyAJkEmBpFS2KEkQEmRX8Whg3mmHq8-P01k",
  authDomain: "firecatchat-6eb3a.firebaseapp.com",
  projectId: "firecatchat-6eb3a",
  storageBucket: "firecatchat-6eb3a.firebasestorage.app",
  messagingSenderId: "451383593989",
  appId: "1:451383593989:web:3a26800f883bd0c7dce06c",
  measurementId: "G-W20Q520LX5"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Обработка фоновых сообщений
messaging.onBackgroundMessage((payload) => {
  console.log('📨 Received background message:', payload);
  
  const notificationTitle = payload.data?.title || 'Огненный Кот';
  const notificationOptions = {
    body: payload.data?.body || 'Новое сообщение',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    image: payload.data?.image,
    data: payload.data,
    actions: [
      {
        action: 'open',
        title: '📖 Открыть чат'
      },
      {
        action: 'close',
        title: '❌ Закрыть'
      }
    ],
    tag: payload.data?.tag || 'default',
    requireInteraction: true
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);
  
  event.notification.close();

  const { action, notification } = event;
  
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
              notification: notification.data
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
                  notification: notification.data
                }
              });
            }
          }, 1000);
        });
      }
    })
  );
});