// social.js - Обработка социальных функций

(function() {
  let myUserId = null;
  let currentWs = null;

  // Инициализация
  function initSocial() {
    // Следим за изменениями window.myId
    const checkMyId = setInterval(() => {
      if (window.myId && myUserId !== window.myId) {
        myUserId = window.myId;
      }
    }, 500);

    // Подписываемся на события создания/подключения WebSocket из client.js
    window.onWebSocketCreated = function(ws) {
      console.log('📡 Social: New WebSocket created');
      attachWebSocketHandler(ws);
    };

    window.onWebSocketConnected = function(ws) {
      console.log('✅ Social: WebSocket connected');
      attachWebSocketHandler(ws);
    };

    // Если WebSocket уже существует, подключаемся
    if (window.ws) {
      attachWebSocketHandler(window.ws);
    }

    setupUIEventListeners();
    addSocialButtons();
  }

  // Подключение обработчика WebSocket
  function attachWebSocketHandler(ws) {
    if (!ws || currentWs === ws) return;
    
    // Отключаем старый обработчик если есть
    if (currentWs) {
      try {
        currentWs.removeEventListener('message', handleSocialMessage);
        console.log('🔄 Social WebSocket handler detached');
      } catch (e) {
        // Игнорируем ошибки при отключении
      }
    }

    // Подключаем новый обработчик
    currentWs = ws;
    ws.addEventListener('message', handleSocialMessage);
    console.log('✅ Social WebSocket handler attached');
  }

  // Настройка обработчиков UI событий
  function setupUIEventListeners() {
    // Профиль
    const profileModal = document.getElementById('profileModal');
    const closeProfile = document.getElementById('closeProfile');
    const saveProfile = document.getElementById('saveProfile');
    
    if (closeProfile) {
      closeProfile.addEventListener('click', () => {
        profileModal.style.display = 'none';
      });
    }

    if (saveProfile) {
      saveProfile.addEventListener('click', saveProfileData);
    }

    // Лента новостей
    const feedModal = document.getElementById('feedModal');
    const closeFeed = document.getElementById('closeFeed');
    const createPost = document.getElementById('createPost');
    
    if (closeFeed) {
      closeFeed.addEventListener('click', () => {
        feedModal.style.display = 'none';
      });
    }

    if (createPost) {
      createPost.addEventListener('click', createNewPost);
    }

    // Друзья
    const friendsModal = document.getElementById('friendsModal');
    const closeFriends = document.getElementById('closeFriends');
    
    if (closeFriends) {
      closeFriends.addEventListener('click', () => {
        friendsModal.style.display = 'none';
      });
    }
  }

  // Добавление кнопок в сайдбар
  function addSocialButtons() {
    const userList = document.getElementById('userList');
    if (!userList) return;

    const socialSection = document.createElement('div');
    socialSection.style.marginTop = '20px';
    socialSection.style.paddingTop = '20px';
    socialSection.style.borderTop = '1px solid var(--border-color)';
    socialSection.innerHTML = `
      <h3 style="color: var(--text-secondary); margin-bottom: 10px; font-size: 14px;">СОЦИАЛЬНАЯ СЕТЬ</h3>
      <button class="social-nav-btn" id="openProfile">👤 Мой Профиль</button>
      <button class="social-nav-btn" id="openFeed">📰 Лента Новостей</button>
      <button class="social-nav-btn" id="openFriends">👥 Друзья</button>
    `;

    userList.parentNode.insertBefore(socialSection, userList.nextSibling);

    // Привязываем обработчики
    document.getElementById('openProfile').addEventListener('click', openProfile);
    document.getElementById('openFeed').addEventListener('click', openFeed);
    document.getElementById('openFriends').addEventListener('click', openFriends);
  }

  // Вспомогательная функция для отправки через WebSocket
  function sendWs(message) {
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
      window.ws.send(JSON.stringify(message));
      return true;
    }
    console.warn('WebSocket not ready');
    return false;
  }

  // Открытие профиля
  function openProfile() {
    const profileModal = document.getElementById('profileModal');
    profileModal.style.display = 'flex';
    sendWs({ type: 'get_profile' });
  }

  // Сохранение профиля
  function saveProfileData() {
    const avatar = document.getElementById('profileAvatar').value;
    const bio = document.getElementById('profileBio').value;
    const status = document.getElementById('profileStatus').value;

    sendWs({
      type: 'update_profile',
      profileData: {
        avatar_url: avatar,
        bio: bio,
        status: status
      }
    });
  }

  // Открытие ленты
  function openFeed() {
    const feedModal = document.getElementById('feedModal');
    feedModal.style.display = 'flex';
    sendWs({ type: 'get_feed' });
  }

  // Создание поста
  function createNewPost() {
    const content = document.getElementById('newPostContent').value;
    if (!content.trim()) return;

    if (sendWs({
      type: 'create_post',
      content: content
    })) {
      document.getElementById('newPostContent').value = '';
    }
  }

  // Открытие списка друзей
  function openFriends() {
    const friendsModal = document.getElementById('friendsModal');
    friendsModal.style.display = 'flex';
    sendWs({ type: 'get_friends' });
    sendWs({ type: 'get_friend_requests' });
  }

  // Обработка сообщений от сервера
  function handleSocialMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      switch(data.type) {
        case 'profile':
          displayProfile(data.profile);
          break;
        case 'profile_updated':
          alert('✅ Профиль обновлен!');
          break;
        case 'feed':
          displayFeed(data.posts);
          break;
        case 'post_created':
          alert('✅ Пост опубликован!');
          openFeed();
          break;
        case 'friends_list':
          displayFriends(data.friends);
          break;
        case 'friend_requests':
          displayFriendRequests(data.requests);
          break;
        case 'new_post':
          // Новый пост от друга - можно показать уведомление
          break;
        case 'friend_request_received':
          alert(`👥 ${data.from.username} отправил запрос в друзья`);
          break;
      }
    } catch (e) {
      // Не наше сообщение
    }
  }

  // Отображение профиля
  function displayProfile(profile) {
    if (!profile) return;
    document.getElementById('profileAvatar').value = profile.avatar_url || '';
    document.getElementById('profileBio').value = profile.bio || '';
    document.getElementById('profileStatus').value = profile.status || '';
  }

  // Отображение ленты
  function displayFeed(posts) {
    const feedPosts = document.getElementById('feedPosts');
    if (!posts || posts.length === 0) {
      feedPosts.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Нет постов</p>';
      return;
    }

    feedPosts.innerHTML = posts.map(post => `
      <div class="post-card">
        <div class="post-header">
          <div class="post-avatar">${post.avatar_url ? `<img src="${post.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : '👤'}</div>
          <div>
            <div class="post-username">${post.username}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${formatDate(post.created_at)}</div>
          </div>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
          <button class="post-action" onclick="likePost('post', ${post.id})">❤️ ${post.likes_count || 0}</button>
          <button class="post-action">💬 ${post.comments_count || 0}</button>
        </div>
      </div>
    `).join('');
  }

  // Отображение друзей
  function displayFriends(friends) {
    const friendsList = document.getElementById('friendsList');
    if (!friends || friends.length === 0) {
      friendsList.innerHTML = '<p style="color: var(--text-muted);">Нет друзей</p>';
      return;
    }

    friendsList.innerHTML = friends.map(friend => `
      <div class="friend-card">
        <div class="friend-info">
          <div class="friend-avatar">${friend.avatar_url ? `<img src="${friend.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : '👤'}</div>
          <div>
            <div class="friend-name">${friend.username}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${friend.status || 'Онлайн'}</div>
          </div>
        </div>
        <button class="friend-action" onclick="removeFriend(${friend.id})">✕</button>
      </div>
    `).join('');
  }

  // Отображение запросов в друзья
  function displayFriendRequests(requests) {
    const friendRequests = document.getElementById('friendRequests');
    if (!requests || requests.length === 0) {
      friendRequests.innerHTML = '<p style="color: var(--text-muted);">Нет запросов</p>';
      return;
    }

    friendRequests.innerHTML = requests.map(request => `
      <div class="friend-card">
        <div class="friend-info">
          <div class="friend-avatar">${request.avatar_url ? `<img src="${request.avatar_url}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : '👤'}</div>
          <div class="friend-name">${request.username}</div>
        </div>
        <button class="friend-action" onclick="acceptFriend(${request.id})">✓ Принять</button>
      </div>
    `).join('');
  }

  // Вспомогательные функции
  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    return date.toLocaleDateString('ru-RU');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Глобальные функции для кнопок
  window.likePost = function(targetType, targetId) {
    if (sendWs({
      type: 'toggle_like',
      targetType: targetType,
      targetId: targetId
    })) {
      // Обновляем ленту через секунду
      setTimeout(() => {
        sendWs({ type: 'get_feed' });
      }, 500);
    }
  };

  window.acceptFriend = function(friendId) {
    if (sendWs({
      type: 'accept_friend_request',
      friendId: friendId
    })) {
      // Обновляем списки
      setTimeout(() => {
        sendWs({ type: 'get_friends' });
        sendWs({ type: 'get_friend_requests' });
      }, 500);
    }
  };

  window.removeFriend = function(friendId) {
    if (confirm('Удалить из друзей?')) {
      if (sendWs({
        type: 'remove_friend',
        friendId: friendId
      })) {
        // Обновляем список
        setTimeout(() => {
          sendWs({ type: 'get_friends' });
        }, 500);
      }
    }
  };

  window.sendFriendRequest = function(userId) {
    if (sendWs({
      type: 'send_friend_request',
      friendId: userId
    })) {
      alert('✅ Запрос отправлен!');
    }
  };

  // Инициализация при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocial);
  } else {
    initSocial();
  }
})();
