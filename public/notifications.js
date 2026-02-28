// Простой модуль для уведомлений внутри чата
class ChatNotificationManager {
  constructor() {
    this.hasPermission = false;
    this.isWindowFocused = true;
    this.soundEnabled = true;
    this.init();
  }

  init() {
    // Отслеживаем фокус окна
    window.addEventListener('focus', () => {
      this.isWindowFocused = true;
    });
    
    window.addEventListener('blur', () => {
      this.isWindowFocused = false;
    });

    // НЕ запрашиваем разрешение автоматически - только по действию пользователя
    // this.requestPermission(); // УБРАНО: нарушает правила браузера
  }

  async requestPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      this.hasPermission = permission === 'granted';
      console.log('🔔 Notification permission:', permission);
    }
  }

  // Показать уведомление в браузере (только если окно не в фокусе)
  showBrowserNotification(title, options = {}) {
    if (!this.hasPermission || this.isWindowFocused) return;

    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'chat-notification',
      requireInteraction: false,
      ...options
    });

    // Автоматически закрываем через 5 секунд
    setTimeout(() => {
      notification.close();
    }, 5000);

    // При клике фокусируем окно
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return notification;
  }

  // Показать уведомление внутри чата
  showInChatNotification(message, type = 'info') {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;

    const notificationEl = document.createElement('div');
    notificationEl.className = `chat-notification ${type}`;
    notificationEl.innerHTML = `
      <div class="notification-content">
        <span class="notification-icon">${this.getNotificationIcon(type)}</span>
        <span class="notification-text">${message}</span>
      </div>
    `;

    // Добавляем стили для уведомления
    notificationEl.style.cssText = `
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(236, 72, 153, 0.9));
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      margin: 8px 0;
      text-align: center;
      font-size: 14px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      animation: slideInUp 0.3s ease-out;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;

    messagesContainer.appendChild(notificationEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Удаляем уведомление через 5 секунд
    setTimeout(() => {
      if (notificationEl.parentNode) {
        notificationEl.style.opacity = '0';
        notificationEl.style.transform = 'translateY(-20px)';
        setTimeout(() => {
          notificationEl.remove();
        }, 300);
      }
    }, 5000);
  }

  getNotificationIcon(type) {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      case 'user': return '👤';
      case 'call': return '📞';
      case 'message': return '💬';
      default: return '🔔';
    }
  }

  // Воспроизвести звук уведомления
  playNotificationSound() {
    if (!this.soundEnabled) return;

    try {
      // Создаем простой звук уведомления
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('Не удалось воспроизвести звук уведомления');
    }
  }

  // Уведомление о новом сообщении
  notifyNewMessage(userName, messageText) {
    const title = `💬 ${userName}`;
    const body = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText;
    
    this.showBrowserNotification(title, { body });
    this.playNotificationSound();
  }

  // Уведомление о входе/выходе пользователя
  notifyUserAction(userName, action) {
    const messages = {
      'joined': `👋 ${userName} присоединился к чату`,
      'left': `👋 ${userName} покинул чат`,
      'renamed': `✏️ Пользователь сменил имя на ${userName}`
    };
    
    const message = messages[action] || `👤 ${userName} ${action}`;
    this.showInChatNotification(message, 'user');
  }

  // Уведомление о звонке
  notifyCall(userName, action) {
    const messages = {
      'incoming': `📞 Входящий звонок от ${userName}`,
      'started': `📞 ${userName} начал видеозвонок`,
      'ended': `📞 Звонок завершен`
    };
    
    const message = messages[action] || `📞 ${userName} ${action}`;
    this.showInChatNotification(message, 'call');
    
    if (action === 'incoming') {
      this.playNotificationSound();
    }
  }

  // Переключить звук
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    this.showInChatNotification(
      this.soundEnabled ? '🔊 Звук уведомлений включен' : '🔇 Звук уведомлений выключен',
      'info'
    );
  }
}

// Создаем глобальный экземпляр
window.chatNotifications = new ChatNotificationManager();