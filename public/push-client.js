(function(){
  // URL бэкенда на Render
  const apiBase = 'https://aqqqqqq-2.onrender.com';
  let isSubscribed = false;

  async function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function getVapidPublicKey(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(`${apiBase}/api/push/vapidPublicKey`);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        return data.publicKey;
      } catch (e) {
        console.log(`🔄 Retry ${i + 1}/${retries}:`, e.message);
        if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    throw new Error('Failed to get VAPID key');
  }

  function updatePushButton(status) {
    const btn = document.getElementById('enablePushBtn');
    const statusEl = document.getElementById('pushStatus');
    if (!btn) return;
    
    if (status === 'subscribed') {
      btn.textContent = '🔔 Уведомления включены';
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      btn.onclick = () => unsubscribeUser();
      if (statusEl) statusEl.textContent = '✅ Вы будете получать уведомления';
      isSubscribed = true;
    } else if (status === 'unsubscribed') {
      btn.textContent = '🔔 Включить уведомления';
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      btn.onclick = () => subscribeUser();
      if (statusEl) statusEl.textContent = '❌ Уведомления выключены';
      isSubscribed = false;
    } else if (status === 'error') {
      btn.textContent = '🔕 Ошибка';
      btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      if (statusEl) statusEl.textContent = '⚠️ Не удалось включить уведомления';
    } else if (status === 'loading') {
      btn.textContent = '⏳ Загрузка...';
      btn.disabled = true;
      btn.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
      if (statusEl) statusEl.textContent = 'Подключение...';
    }
  }

  async function checkSubscriptionStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      updatePushButton('error');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      updatePushButton(subscription ? 'subscribed' : 'unsubscribed');
    } catch (e) {
      console.error('Error checking subscription:', e);
      updatePushButton('unsubscribed');
    }
  }

  async function subscribeUser() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push-уведомления не поддерживаются в этом браузере');
      return null;
    }

    updatePushButton('loading');

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Для уведомлений нужно разрешение!');
        updatePushButton('unsubscribed');
        return null;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = await getVapidPublicKey();
      const applicationServerKey = await urlBase64ToUint8Array(publicKey);

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      const res = await fetch(`${apiBase}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Subscribe response:', errText);
        throw new Error('Subscribe failed');
      }

      if (res.ok) {
        console.log('✅ Push subscribed');
        updatePushButton('subscribed');
        // Проверим, что уведомление приходит
        await registration.showNotification('🔔 Уведомления включены!', {
          body: 'Теперь вы будете получать уведомления, даже когда браузер закрыт',
          icon: '/icon-192.png'
        });
      } else {
        updatePushButton('error');
      }
      return subscription;
    } catch (e) {
      console.error('Subscribe error:', e);
      updatePushButton('error');
      return null;
    }
  }

  async function unsubscribeUser() {
    updatePushButton('loading');
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(`${apiBase}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
        console.log('🛑 Push unsubscribed');
      }
      updatePushButton('unsubscribed');
    } catch (e) {
      console.error('Unsubscribe error:', e);
      updatePushButton('error');
    }
  }

  // Expose globally
  window.pushClient = { subscribeUser, unsubscribeUser, checkSubscriptionStatus };

  // Проверить статус при загрузке (без автоматической подписки!)
  window.addEventListener('load', () => {
    checkSubscriptionStatus();
    
    // Привязываем кнопку
    const btn = document.getElementById('enablePushBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (isSubscribed) {
          unsubscribeUser();
        } else {
          subscribeUser();
        }
      });
    }
  });
})();
