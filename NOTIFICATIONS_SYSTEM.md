# 🔔 Система уведомлений внутри чата

## Описание
Простая система уведомлений, работающая полностью внутри приложения без внешних зависимостей типа Firebase.

## Возможности

### 🎵 Звуковые уведомления
- Уведомления о новых сообщениях
- Звуки входа/выхода пользователей
- Уведомления о звонках
- Системные звуки

### 🖥️ Браузерные уведомления
- Показ уведомлений когда окно не в фокусе
- Автоматическое закрытие через 5 секунд
- Клик по уведомлению фокусирует окно

### 💬 Уведомления внутри чата
- Системные сообщения
- Уведомления о действиях пользователей
- Статусы звонков и игр

## Файлы системы

### `notifications.js`
Основной модуль системы уведомлений:
```javascript
class ChatNotificationManager {
  // Управление разрешениями
  requestPermission()
  
  // Браузерные уведомления
  showBrowserNotification(title, options)
  
  // Уведомления в чате
  showInChatNotification(message, type)
  
  // Звуковые уведомления
  playNotificationSound()
  
  // Специализированные уведомления
  notifyNewMessage(userName, messageText)
  notifyUserAction(userName, action)
  notifyCall(userName, action)
}
```

### `client.js`
Интеграция с основным приложением:
```javascript
// Звуковые эффекты
const sounds = {
  message: () => playTone(800, 0.1, 'sine'),
  join: () => playTone(600, 0.2, 'triangle'),
  leave: () => playTone(400, 0.2, 'triangle'),
  call: () => { /* двойной сигнал */ },
  notification: () => playTone(1200, 0.15, 'square')
};

// Использование
playSound('message'); // При получении сообщения
playSound('call');    // При звонке
```

### `sw.js`
Service Worker для обработки уведомлений:
```javascript
// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  // Фокусирует окно приложения
  // Отправляет данные в приложение
});
```

## Типы уведомлений

### 1. Сообщения
```javascript
// Новое сообщение
notifyNewMessage('Пользователь', 'Текст сообщения');

// Показывает:
// - Звук уведомления
// - Браузерное уведомление (если окно не в фокусе)
// - Анимацию в интерфейсе
```

### 2. Пользователи
```javascript
// Вход/выход пользователей
notifyUserAction('Пользователь', 'joined');
notifyUserAction('Пользователь', 'left');

// Показывает уведомление в чате с соответствующим звуком
```

### 3. Звонки
```javascript
// Входящий звонок
notifyCall('Пользователь', 'incoming');

// Показывает:
// - Звук звонка
// - Браузерное уведомление
// - Модальное окно принятия звонка
```

### 4. Системные
```javascript
// Системное уведомление
showInChatNotification('Сервер перезагружается', 'warning');

// Типы: 'info', 'success', 'error', 'warning', 'user', 'call', 'message'
```

## Настройки

### Включение/выключение звука
```javascript
// Переключение звука
window.chatNotifications.toggleSound();

// Проверка состояния
console.log(window.chatNotifications.soundEnabled);
```

### Разрешения браузера
```javascript
// Запрос разрешений
await window.chatNotifications.requestPermission();

// Проверка разрешений
console.log(window.chatNotifications.hasPermission);
```

## Интеграция

### В HTML
```html
<!-- Подключение скриптов -->
<script src="notifications.js"></script>
<script src="client.js"></script>
```

### В JavaScript
```javascript
// Глобальный доступ
window.chatNotifications.notifyNewMessage('User', 'Hello!');

// Через события
document.addEventListener('newMessage', (event) => {
  window.chatNotifications.notifyNewMessage(
    event.detail.userName, 
    event.detail.text
  );
});
```

## Преимущества

✅ **Простота** - Нет внешних зависимостей  
✅ **Быстрота** - Мгновенные уведомления  
✅ **Надежность** - Работает офлайн  
✅ **Гибкость** - Легко настраивается  
✅ **Совместимость** - Работает во всех браузерах  

## Совместимость

- ✅ Chrome/Edge 50+
- ✅ Firefox 45+
- ✅ Safari 10+
- ✅ Mobile browsers
- ✅ PWA режим

## Примеры использования

### Базовое уведомление
```javascript
window.chatNotifications.showInChatNotification(
  'Добро пожаловать в чат!', 
  'success'
);
```

### Уведомление с звуком
```javascript
window.chatNotifications.playNotificationSound();
window.chatNotifications.showInChatNotification(
  'Важное сообщение!', 
  'warning'
);
```

### Браузерное уведомление
```javascript
window.chatNotifications.showBrowserNotification(
  'Новое сообщение',
  { 
    body: 'Пользователь написал вам',
    icon: '/favicon.ico'
  }
);
```

## Отладка

### Консольные сообщения
```javascript
// Включить отладку
window.chatNotifications.debug = true;

// Проверить состояние
console.log('Notifications:', {
  enabled: window.chatNotifications.soundEnabled,
  permission: window.chatNotifications.hasPermission,
  windowFocused: window.chatNotifications.isWindowFocused
});
```

### Тестирование
```javascript
// Тест всех типов уведомлений
window.chatNotifications.notifyNewMessage('Тест', 'Сообщение');
window.chatNotifications.notifyUserAction('Тест', 'joined');
window.chatNotifications.notifyCall('Тест', 'incoming');
```