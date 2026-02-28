// Система внутренних уведомлений
class NotificationManager {
  constructor() {
    this.subscribers = new Map();
    this.history = [];
    this.maxHistory = 100;
  }

  subscribe(userId, callback) {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, []);
    }
    this.subscribers.get(userId).push(callback);
  }

  unsubscribe(userId) {
    this.subscribers.delete(userId);
  }

  notify(userId, notification) {
    const notif = {
      id: Date.now(),
      userId,
      type: notification.type || 'info',
      title: notification.title,
      message: notification.message,
      data: notification.data,
      timestamp: new Date().toISOString(),
      read: false
    };

    this.history.unshift(notif);
    if (this.history.length > this.maxHistory) {
      this.history.pop();
    }

    const callbacks = this.subscribers.get(userId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(notif);
        } catch (error) {
          console.error('Notification callback error:', error);
        }
      });
    }
  }

  broadcast(notification) {
    this.subscribers.forEach((callbacks, userId) => {
      this.notify(userId, notification);
    });
  }

  getHistory(userId, limit = 10) {
    return this.history
      .filter(n => n.userId === userId)
      .slice(0, limit);
  }

  markAsRead(notificationId) {
    const notif = this.history.find(n => n.id === notificationId);
    if (notif) {
      notif.read = true;
    }
  }
}

module.exports = NotificationManager;