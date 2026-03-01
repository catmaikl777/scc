(() => {
  // DOM элементы
  const messagesEl = document.getElementById("messages");
  const messageForm = document.getElementById("messageForm");
  const messageInput = document.getElementById("messageInput");
  const nameInput = document.getElementById("nameInput");
  const setNameBtn = document.getElementById("setName");
  const userListEl = document.getElementById("userList");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const closeSidebar = document.getElementById("closeSidebar");
  const overlay = document.getElementById("overlay");
  const onlineCount = document.getElementById("onlineCount");
  const fileInput = document.getElementById("fileInput");
  const fileUploadBtn = document.getElementById("fileUploadBtn");
  const voiceMessageBtn = document.getElementById("voiceMessageBtn");
  const startCallBtn = document.getElementById("startCall");
  const endCallBtn = document.getElementById("endCall");
  const videoCallContainer = document.getElementById("videoCallContainer");
  const localVideo = document.getElementById("localVideo");
  const toggleVideoBtn = document.getElementById("toggleVideo");
  const toggleAudioBtn = document.getElementById("toggleAudio");
  const closeCallBtn = document.getElementById("closeCall");
  const incomingCallModal = document.getElementById("incomingCallModal");
  const callerNameEl = document.getElementById("callerName");
  const acceptCallBtn = document.getElementById("acceptCall");
  const rejectCallBtn = document.getElementById("rejectCall");
  const callStatusEl = document.getElementById("callStatus");
  const participantsCountEl = document.getElementById("participantsCount");
  const joinCallBtn = document.getElementById("joinCall");
  const voiceRecordModal = document.getElementById("voiceRecordModal");
  const voiceRecordVisualization = document.getElementById(
    "voiceRecordVisualization"
  );
  const voiceRecordTimer = document.getElementById("voiceRecordTimer");
  const stopRecordBtn = document.getElementById("stopRecordBtn");
  const cancelRecordBtn = document.getElementById("cancelRecordBtn");
  const enableNotificationsBtn = document.getElementById("enableNotifications");

  // Локальное видео скрыто в HTML

  // Глобальные переменные
  let myId = null;
  let mySessionId = null;
  let ws = null;
  const users = new Map();
  let historyLoaded = false;
  let isConnected = false;
  let activeCalls = [];
  let activeCallsModal = null;
  let notificationPermission = false;
  let serviceWorkerRegistration = null;

  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // WebRTC переменные
  let localStream = null;
  let peerConnections = new Map();
  let currentRoomId = null;
  let isInCall = false;
  let incomingCall = null;
  let isCallInitiator = false;
  let participantsCount = 1;
  let roomUsers = new Map();
  let currentCamera = "user"; // 'user' - фронтальная, 'environment' - задняя
  let availableCameras = [];
  let switchCameraBtn = document.getElementById("switchCamera");
  let currentVideoTrack = null;

  // Переменные для голосовых сообщений
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let recordingTimer = null;
  let recordingStartTime = 0;
  let audioContext = null;
  let analyser = null;
  let visualizationBars = [];
  let visualizationInterval = null;
  const iceRestartTimers = new Map();
  const lastIceRestartAt = new Map();
  const offerInProgress = new Set();

  // Аудиоплеер для голосовых сообщений
  let currentAudio = null;
  let currentAudioButton = null;
  let currentAudioVisualizationInterval = null;
  const pendingRemoteDescriptions = new Map();

  // Оптимизированная WebRTC конфигурация для быстрого подключения
  const rtcConfig = {
    iceServers: [
      // Быстрые Google STUN серверы (приоритет)
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      // Cloudflare STUN (быстрый)
      { urls: "stun:stun.cloudflare.com:3478" },
      // Основной TURN сервер (быстрый, надежный)
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:80?transport=tcp"
        ],
        username: "openrelayproject",
        credential: "openrelayproject"
      },
      // Резервный TURN
      {
        urls: "turn:relay.backups.cz",
        username: "webrtc",
        credential: "webrtc"
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "all",
    iceGatheringTimeout: 5000
  };

  const rtcConfigRelay = {
    ...rtcConfig,
    iceTransportPolicy: "relay",
    iceCandidatePoolSize: 15,
    iceGatheringTimeout: 8000
  };

  // Специальная конфигурация только для TURN
  const rtcConfigTurnOnly = {
    iceServers: rtcConfig.iceServers.filter(server => server.urls.toString().includes('turn:')),
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "relay",
    iceGatheringTimeout: 10000
  };

  // Звуковые эффекты
  const sounds = {
    message: () => playTone(800, 0.1, 'sine'),
    join: () => playTone(600, 0.2, 'triangle'),
    leave: () => playTone(400, 0.2, 'triangle'),
    call: () => { playTone(1000, 0.1, 'sine'); setTimeout(() => playTone(800, 0.1, 'sine'), 150); },
    notification: () => playMeowSound()
  };

  // Глобальный аудио объект для мобильных
  let meowAudio = null;
  let audioInitialized = false;

  // Инициализация аудио для мобильных устройств
  function initAudio() {
    if (!audioInitialized) {
      try {
        meowAudio = new Audio('./nmeow.mp3');
        meowAudio.volume = 0.5;
        meowAudio.preload = 'auto';
        // Попытка воспроизвести беззвучно для инициализации
        meowAudio.muted = true;
        meowAudio.play().then(() => {
          meowAudio.pause();
          meowAudio.currentTime = 0;
          meowAudio.muted = false;
          audioInitialized = true;
          console.log('✅ Аудио инициализировано');
        }).catch(() => {});
      } catch (e) {
        console.warn('Ошибка инициализации аудио:', e);
      }
    }
  }

  // Функция для воспроизведения звука мяу
  function playMeowSound() {
    try {
      if (meowAudio && audioInitialized) {
        meowAudio.currentTime = 0;
        const playPromise = meowAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.warn('Не удалось воспроизвести звук мяу:', e);
            playTone(1200, 0.15, 'square');
          });
        }
      } else {
        // Создаем новый аудио объект если глобальный не готов
        const audio = new Audio('./nmeow.mp3');
        audio.volume = 0.5;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.warn('Не удалось воспроизвести звук мяу:', e);
            playTone(1200, 0.15, 'square');
          });
        }
      }
    } catch (e) {
      console.warn('Ошибка воспроизведения аудио:', e);
      playTone(1200, 0.15, 'square');
    }
  }

  function playSound(type) {
    if (sounds[type]) {
      sounds[type]();
    }
  }

  function playTone(frequency, duration, type = 'sine') {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
      console.warn('Звук недоступен:', e);
    }
  }

  // Инициализация приложения
  function init() {
    console.log("🔍 Debug - Voice recording elements:", {
      voiceRecordModal: !!voiceRecordModal,
      stopRecordBtn: !!stopRecordBtn,
      cancelRecordBtn: !!cancelRecordBtn,
      voiceRecordTimer: !!voiceRecordTimer,
      voiceRecordVisualization: !!voiceRecordVisualization,
    });

    setupEventListeners();
    initializeEmojiPanel();
    initializeVoiceRecording();
    initializeNotifications();
    loadUserName();
    connectWebSocket();

    // Добавляем обработчик клавиш
    document.addEventListener("keydown", handleKeyPress);
  }

  function setupEventListeners() {
    // Инициализация аудио при первом взаимодействии
    const initAudioOnInteraction = () => {
      initAudio();
      document.removeEventListener('touchstart', initAudioOnInteraction);
      document.removeEventListener('click', initAudioOnInteraction);
    };
    document.addEventListener('touchstart', initAudioOnInteraction, { once: true });
    document.addEventListener('click', initAudioOnInteraction, { once: true });

    // Сайдбар
    sidebarToggle.addEventListener("click", toggleSidebar);
    closeSidebar.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", toggleSidebar);

    // Форма сообщения
    messageForm.addEventListener("submit", handleMessageSubmit);
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleMessageSubmit(e);
      }
    });

    if (switchCameraBtn) {
      switchCameraBtn.addEventListener("click", switchCamera);
    }

    if (joinCallBtn) {
      joinCallBtn.addEventListener("click", showActiveCallsModal);
    }

    // Установка имени
    setNameBtn.addEventListener("click", handleNameChange);
    nameInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleNameChange();
    });

    // Загрузка файлов
    fileUploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileUpload);

    // Голосовые сообщения - ОСНОВНАЯ КНОПКА
    voiceMessageBtn.addEventListener("click", startVoiceRecording);

    // КНОПКИ В МОДАЛЬНОМ ОКНЕ ЗАПИСИ - ИСПРАВЛЕННЫЕ ОБРАБОТЧИКИ
    if (stopRecordBtn) {
      console.log("✅ Stop record button found, adding listener");
      stopRecordBtn.addEventListener("click", handleStopRecordClick);
    } else {
      console.error("❌ Stop record button NOT FOUND!");
    }

    if (cancelRecordBtn) {
      console.log("✅ Cancel record button found, adding listener");
      cancelRecordBtn.addEventListener("click", handleCancelRecordClick);
    } else {
      console.error("❌ Cancel record button NOT FOUND!");
    }

    // Звонки
    startCallBtn.addEventListener("click", startGroupCall);
    endCallBtn.addEventListener("click", endCall);
    closeCallBtn.addEventListener("click", endCall);
    toggleVideoBtn.addEventListener("click", toggleVideo);
    toggleAudioBtn.addEventListener("click", toggleAudio);

    // Входящие звонки
    acceptCallBtn.addEventListener("click", acceptCall);
    rejectCallBtn.addEventListener("click", rejectCall);

    // Адаптивность
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", setVH);

    // Уведомления
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    // Кнопка включения уведомлений
    if (enableNotificationsBtn) {
      enableNotificationsBtn.addEventListener("click", requestNotificationPermission);
    }
  }

  // ОТДЕЛЬНЫЕ ФУНКЦИИ ДЛЯ КНОПОК ЗАПИСИ
  function handleStopRecordClick() {
    console.log("🛑 STOP RECORD BUTTON CLICKED!");
    console.log(
      "Current state - isRecording:",
      isRecording,
      "mediaRecorder:",
      mediaRecorder
    );
    console.log("Global mediaRecorder:", window.currentMediaRecorder);

    // Пробуем использовать глобальную переменную если локальная null
    const recorderToUse = mediaRecorder || window.currentMediaRecorder;

    if (recorderToUse && recorderToUse.state === "recording") {
      console.log("✅ Stopping recording via button...");
      stopVoiceRecording();
    } else {
      console.log(
        "❌ Cannot stop - mediaRecorder not recording, state:",
        recorderToUse?.state
      );
      // Принудительная очистка
      cleanupRecording();
      showSystemMessage("❌ Запись не активна");
    }
  }

  function handleCancelRecordClick() {
    console.log("❌ CANCEL RECORD BUTTON CLICKED!");
    cancelVoiceRecording();
  }

  function handleKeyPress(event) {
    if (event.key === "Escape" && isRecording) {
      console.log("⎋ Escape pressed, canceling recording");
      cancelVoiceRecording();
    }
  }

  function initializeEmojiPanel() {
    const emojiPanel = document.querySelector(".emoji-panel");
    if (!emojiPanel) return;

    // Проверяем, не инициализирована ли уже панель
    if (emojiPanel.dataset.initialized) return;
    emojiPanel.dataset.initialized = "true";

    const emojis = [
      "😀",
      "😂",
      "😍",
      "🤔",
      "👏",
      "🎉",
      "❤️",
      "🔥",
      "👍",
      "👎",
      "😎",
      "🤯",
      "🎂",
      "🚀",
      "⭐",
      "💯",
    ];

    // Очищаем только если есть содержимое
    if (emojiPanel.children.length > 16) {
      emojiPanel.innerHTML = "";
    }
    
    emojis.forEach((emoji) => {
      const button = document.createElement("button");
      button.textContent = emoji;
      button.type = "button";
      button.addEventListener("click", () => {
        sendMessage({ type: "reaction", emoji });
      });
      emojiPanel.appendChild(button);
    });
    
    const stickerBtn = document.createElement("button");
    stickerBtn.textContent = "🎭";
    stickerBtn.title = "Стикеры";
    stickerBtn.type = "button";
    stickerBtn.addEventListener("click", toggleStickerPanel);
    emojiPanel.appendChild(stickerBtn);
    
    const gameBtn = document.createElement("button");
    gameBtn.textContent = "🎮";
    gameBtn.title = "Игры";
    gameBtn.type = "button";
    gameBtn.addEventListener("click", showGameMenu);
    emojiPanel.appendChild(gameBtn);
    
    const pollBtn = document.createElement("button");
    pollBtn.textContent = "📊";
    pollBtn.title = "Создать опрос";
    pollBtn.type = "button";
    pollBtn.addEventListener("click", showPollCreator);
    emojiPanel.appendChild(pollBtn);
    
    const roomBtn = document.createElement("button");
    roomBtn.textContent = "🔒";
    roomBtn.title = "Приватные комнаты";
    roomBtn.type = "button";
    roomBtn.addEventListener("click", () => {
      sendMessage({ type: 'get_private_rooms' });
    });
    emojiPanel.appendChild(roomBtn);
    
    const friendBtn = document.createElement("button");
    friendBtn.textContent = "👥";
    friendBtn.title = "Друзья";
    friendBtn.type = "button";
    friendBtn.addEventListener("click", window.showFriends);
    emojiPanel.appendChild(friendBtn);
    
    const tournamentBtn = document.createElement("button");
    tournamentBtn.textContent = "🏆";
    tournamentBtn.title = "Турнир";
    tournamentBtn.type = "button";
    tournamentBtn.addEventListener("click", window.createTournament);
    emojiPanel.appendChild(tournamentBtn);
    
    const videoBtn = document.createElement("button");
    videoBtn.textContent = "📹";
    videoBtn.title = "Видео-сообщение";
    videoBtn.type = "button";
    videoBtn.addEventListener("click", window.sendVideoMessage);
    emojiPanel.appendChild(videoBtn);
    
    const musicBtn = document.createElement("button");
    musicBtn.textContent = "🎵";
    musicBtn.title = "Музыка";
    musicBtn.type = "button";
    musicBtn.addEventListener("click", window.showMusicPlayer);
    emojiPanel.appendChild(musicBtn);
    
    const screenBtn = document.createElement("button");
    screenBtn.textContent = "📱";
    screenBtn.title = "Демонстрация экрана";
    screenBtn.type = "button";
    screenBtn.addEventListener("click", window.shareScreen);
    emojiPanel.appendChild(screenBtn);
    
    const cardGameBtn = document.createElement("button");
    cardGameBtn.textContent = "🃏";
    cardGameBtn.title = "Карточные игры";
    cardGameBtn.type = "button";
    cardGameBtn.addEventListener("click", window.showCardGames);
    emojiPanel.appendChild(cardGameBtn);
    
    const partyGameBtn = document.createElement("button");
    partyGameBtn.textContent = "🎉";
    partyGameBtn.title = "Групповые игры";
    partyGameBtn.type = "button";
    partyGameBtn.addEventListener("click", window.showPartyGames);
    emojiPanel.appendChild(partyGameBtn);
    
    const translatorBtn = document.createElement("button");
    translatorBtn.textContent = "🌐";
    translatorBtn.title = "Переводчик";
    translatorBtn.type = "button";
    translatorBtn.addEventListener("click", window.showTranslator);
    emojiPanel.appendChild(translatorBtn);
    
    const reminderBtn = document.createElement("button");
    reminderBtn.textContent = "⏰";
    reminderBtn.title = "Напоминания";
    reminderBtn.type = "button";
    reminderBtn.addEventListener("click", window.showReminders);
    emojiPanel.appendChild(reminderBtn);
    
    const calculatorBtn = document.createElement("button");
    calculatorBtn.textContent = "🧮";
    calculatorBtn.title = "Калькулятор";
    calculatorBtn.type = "button";
    calculatorBtn.addEventListener("click", window.showCalculator);
    emojiPanel.appendChild(calculatorBtn);
    
    const drawBtn = document.createElement("button");
    drawBtn.textContent = "🎨";
    drawBtn.title = "Рисование";
    drawBtn.type = "button";
    drawBtn.addEventListener("click", window.showDrawing);
    emojiPanel.appendChild(drawBtn);
  }

  function toggleStickerPanel() {
    let stickerPanel = document.querySelector('.sticker-panel');
    if (!stickerPanel) {
      stickerPanel = document.createElement('div');
      stickerPanel.className = 'sticker-panel';
      stickerPanel.style.display = 'none';
      document.querySelector('.emoji-panel').after(stickerPanel);
      // Запрашиваем стикеры только если панель пустая
      if (stickerPanel.children.length === 0) {
        sendMessage({ type: 'get_stickers' });
      }
    }
    
    stickerPanel.style.display = stickerPanel.style.display === 'none' ? 'flex' : 'none';
  }

  function showGameMenu() {
    const gameTypes = [
      { type: 'tic-tac-toe', name: 'Крестики-нолики', emoji: '⭕', players: '2' },
      { type: 'word-chain', name: 'Цепочка слов', emoji: '🔤', players: '3-5' },
      { type: 'quiz', name: 'Викторина', emoji: '❓', players: '3-5' },
      { type: 'riddle', name: 'Загадки', emoji: '🧩', players: '3-5' },
      { type: 'mafia', name: 'Мафия', emoji: '🕵️', players: '4-5' },
      { type: 'werewolf', name: 'Оборотни', emoji: '🐺', players: '5' },
      { type: 'alias', name: 'Алиас', emoji: '💭', players: '4-5' },
      { type: 'uno', name: 'УНО', emoji: '🎴', players: '3-4' },
      { type: 'blackjack', name: 'Блэкджек', emoji: '🃏', players: '3-5' }
    ];
    
    const menu = gameTypes.map(game => 
      `<button onclick="createGame('${game.type}')">
        <div class="game-icon">${game.emoji}</div>
        <div class="game-info">
          <div class="game-name">${game.name}</div>
          <div class="game-players">${game.players} игроков</div>
        </div>
      </button>`
    ).join('');
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🎮 Выберите игру</h3>
        <div class="game-menu">${menu}</div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function showPollCreator() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>Создать опрос</h3>
        <input id="pollQuestion" placeholder="Вопрос" style="width:100%;margin:8px 0;padding:8px">
        <div id="pollOptions">
          <input class="poll-option-input" placeholder="Вариант 1" style="width:100%;margin:4px 0;padding:6px">
          <input class="poll-option-input" placeholder="Вариант 2" style="width:100%;margin:4px 0;padding:6px">
        </div>
        <button onclick="addPollOption()">+ Добавить вариант</button>
        <div style="margin:8px 0">
          <label>Длительность (минуты): <input id="pollDuration" type="number" min="1" max="1440" placeholder="Без ограничения"></label>
        </div>
        <div class="modal-buttons">
          <button onclick="createPoll()" class="accept-btn">Создать</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function initializeVoiceRecording() {
    if (voiceRecordVisualization) {
      voiceRecordVisualization.innerHTML = "";
      visualizationBars = [];

      for (let i = 0; i < 40; i++) {
        const bar = document.createElement("div");
        bar.className = "voice-record-bar";
        bar.style.height = "2px";
        bar.style.background = "var(--primary-red)";
        bar.style.transition = "height 0.1s ease, background 0.1s ease";
        bar.style.borderRadius = "1px";
        bar.style.minWidth = "3px";
        voiceRecordVisualization.appendChild(bar);
        visualizationBars.push(bar);
      }
    }
  }

  function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);
  }

  function handleResize() {
    if (window.innerWidth > 768) {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    }
    setVH();
  }

  function toggleSidebar() {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    }
  }

  // УПРОЩЕННАЯ РАБОТА С ИМЕНАМИ
  function handleNameChange() {
    const name = nameInput.value.trim();

    if (!name) {
      showSystemMessage("❌ Введите имя");
      return;
    }

    if (name.length > 20) {
      showSystemMessage("❌ Слишком длинное имя");
      return;
    }

    // Просто отправляем имя на сервер
    sendMessage({ type: "setName", name: name });
    localStorage.setItem("chatUserName", name);
    showSystemMessage("✅ Имя сохранено");
  }

  function loadUserName() {
    const savedName = localStorage.getItem("chatUserName");
    if (savedName && nameInput) {
      nameInput.value = savedName;
    }
  }

  function handleNameUpdated(message) {
    if (message.userId === myId) {
      localStorage.setItem("chatUserName", message.newName);
      showSystemMessage(`✅ Теперь вас зовут ${message.newName}`);
    }
  }

  // WebSocket соединение с диагностикой
  function connectWebSocket() {
    let wsUrl;
    if (window.cordova) {
      wsUrl = "wss://aqqqqqq-2.onrender.com";
    } else if (window.location.hostname === "localhost") {
      wsUrl = "ws://localhost:3000";
    } else {
      wsUrl = "wss://aqqqqqq-2.onrender.com";
    }

    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
    showSystemMessage(`🔌 Подключение к серверу...`);

    try {
      ws = new WebSocket(wsUrl);
      setupWebSocketHandlers();
    } catch (error) {
      console.error("❌ Error creating WebSocket:", error);
      showSystemMessage(`❌ Ошибка подключения: ${error.message}`);
      handleConnectionError();
    }
  }

  function setupWebSocketHandlers() {
    ws.onopen = () => {
      console.log("✅ WebSocket connected to server");
      isConnected = true;
      reconnectAttempts = 0;
      showSystemMessage("✅ Подключено к серверу");
      
      // Проверяем качество соединения
      setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const pingStart = Date.now();
          sendMessage({ type: "ping", timestamp: pingStart });
        }
      }, 1000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      showSystemMessage("❌ Ошибка соединения с сервером");
      
      // Диагностика сетевых проблем
      if (!navigator.onLine) {
        showSystemMessage("🌐 Нет интернет-соединения");
      } else {
        showSystemMessage("🔍 Проверяем доступность сервера...");
        checkServerConnectivity();
      }
    };

    ws.onclose = (event) => {
      console.log("❌ WebSocket disconnected:", event.code, event.reason);
      isConnected = false;

      let closeReason = "Соединение разорвано";
      switch(event.code) {
        case 1000: closeReason = "Нормальное закрытие"; break;
        case 1001: closeReason = "Сервер недоступен"; break;
        case 1006: closeReason = "Соединение прервано"; break;
        case 1011: closeReason = "Ошибка сервера"; break;
        case 1012: closeReason = "Перезагрузка сервера"; break;
        case 1013: closeReason = "Сервер перегружен"; break;
      }
      
      showSystemMessage(`❌ ${closeReason} (код: ${event.code})`);

      if (event.code !== 1000 && event.code !== 4000) {
        handleReconnection();
      }
    };
  }

  function handleReconnection() {
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = reconnectDelay * reconnectAttempts;

      showSystemMessage(
        `🔄 Переподключение через ${
          delay / 1000
        }сек... (${reconnectAttempts}/${maxReconnectAttempts})`
      );

      setTimeout(() => {
        if (!isConnected) {
          connectWebSocket();
        }
      }, delay);
    } else {
      showSystemMessage(
        "❌ Не удалось подключиться к серверу. Обновите страницу."
      );
    }
  }

  function handleConnectionError() {
    showSystemMessage("❌ Ошибка подключения к серверу");
    checkServerConnectivity();
  }

  // Проверка доступности сервера
  async function checkServerConnectivity() {
    const servers = [
      'https://aqqqqqq-2.onrender.com',
      'https://www.google.com',
      'https://www.cloudflare.com'
    ];

    for (const server of servers) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(server + '/ping', {
          method: 'GET',
          signal: controller.signal,
          mode: 'no-cors'
        });
        
        clearTimeout(timeoutId);
        
        if (server.includes('aqqqqqq')) {
          showSystemMessage(`✅ Сервер доступен`);
          return true;
        } else {
          console.log(`✅ ${server} accessible`);
        }
      } catch (error) {
        console.log(`❌ ${server} not accessible:`, error.message);
        if (server.includes('aqqqqqq')) {
          showSystemMessage(`❌ Сервер недоступен`);
        }
      }
    }
    
    showSystemMessage(`🌐 Проверьте интернет-соединение`);
    return false;
  }

  // Обработка сообщений WebSocket
  function handleWebSocketMessage(message) {
    console.log("📨 Received message:", message.type, message);

    switch (message.type) {
      case "init":
        handleInitMessage(message);
        break;
      case "history":
        handleHistoryMessage(message);
        break;
      case "pong":
        if (message.timestamp) {
          const latency = Date.now() - message.timestamp;
          console.log(`🏓 Server latency: ${latency}ms`);
          if (latency > 1000) {
            showSystemMessage(`⚠️ Высокая задержка: ${latency}ms`);
          }
        }
        break;
      case "message":
        showMessage(message);
        notifyNewMessage(message);
        // Показываем уведомление если страница не активна
        if (document.hidden && window.backgroundNotifications) {
          window.backgroundNotifications.showNotification(
            `💬 ${message.name}`,
            { body: message.text }
          );
        }
        break;
      case "system":
        showSystemMessage(message.text);
        if (
          message.text &&
          (message.text.includes("вошёл") || message.text.includes("вышел"))
        ) {
          notifySystemEvent("👤 Изменение участников", message.text);
        }
        break;
      case "action":
        showActionMessage(message);
        break;
      case "reaction":
        showReactionMessage(message);
        break;
      case "file":
        if (message.filetype && message.filetype.startsWith("audio/")) {
          showVoiceMessage(message);
        } else {
          showFileMessage(message);
        }
        break;
      case "sticker":
        showStickerMessage(message);
        break;
      case "poll_created":
        showPollMessage(message.poll);
        break;
      case "poll_vote":
        updatePollVotes(message);
        break;
      case "game_created":
        showGameMessage(message);
        break;
      case "game_joined":
        updateGameParticipants(message);
        break;
      case "game_started":
        showGameInterface(message);
        break;
      case "game_move":
        handleGameMove(message);
        break;
      case "game_ended":
        handleGameEnd(message);
        break;
      case 'private_room_created':
        showSystemMessage(`🔒 Приватная комната "${message.name}" создана! ID: ${message.roomId}`);
        break;
      case 'private_room_joined':
        showSystemMessage(`✅ Вы присоединились к комнате "${message.roomName}"`);
        break;
      case 'private_rooms_list':
        showPrivateRoomsList(message.rooms);
        break;
      case 'friend_request':
        showFriendRequest(message);
        break;
      case 'friend_request_accepted':
        showSystemMessage(`✅ ${message.byUserName} принял ваш запрос в друзья`);
        break;
      case 'friends_list':
        showFriendsList(message.friends);
        break;
      case 'tournament_created':
        showTournamentMessage(message.tournament);
        break;
      case 'tournament_started':
        showSystemMessage(`🏆 Турнир "${message.name}" начался!`);
        updateTournamentStatus(message.tournamentId, 'started');
        break;
      case 'tournament_joined':
        updateTournamentParticipants(message);
        break;
      case 'tournament_round':
        showTournamentRound(message);
        break;
      case 'tournament_ended':
        showTournamentResults(message);
        break;
      case 'music_shared':
        showMusicMessage(message);
        break;
      case 'screen_share_started':
        handleScreenShareStarted(message);
        break;
      case 'screen_share_stopped':
        handleScreenShareStopped(message);
        break;
      case 'screen_share_data':
        handleScreenShareData(message);
        break;
      // Убрано: level_up
      case "stickers_list":
        updateStickerPanel(message.stickers);
        break;
      // Убрано: user_level
      case "users":
        updateUsersList(message.users);
        break;
      case "name_updated":
        handleNameUpdated(message);
        break;
      case "private":
        handlePrivateMessage(message);
        showNotification(`🔒 Личное сообщение от ${message.name}`, {
          body: message.text,
          tag: "private-message",
          requireInteraction: true,
        });
        break;
      case "private_sent":
        showSystemMessage("✅ Личное сообщение отправлено");
        break;

      // WebRTC сообщения
      case "call_invite":
        handleCallInvite(message);
        notifyIncomingCall(message);
        // Уведомление о входящем звонке
        if (window.backgroundNotifications) {
          window.backgroundNotifications.showNotification(
            `📞 Входящий звонок`,
            { body: `${message.fromUserName} звонит вам` }
          );
        }
        break;
      case "call_started":
        handleCallStarted(message);
        break;
      case "room_created":
        handleRoomCreated(message);
        break;
      case "room_users":
        handleRoomUsers(message);
        break;
      case "user_joined":
        handleUserJoined(message);
        break;
      case "user_left":
        handleUserLeft(message);
        break;
      case "webrtc_offer":
        handleWebRTCOffer(message);
        break;
      case "webrtc_answer":
        handleWebRTCAnswer(message);
        break;
      case "webrtc_ice_candidate":
        handleICECandidate(message);
        break;
      case "call_rejected":
        handleCallRejected(message);
        break;
      case "call_ended":
        handleCallEnded(message);
        break;
      case "group_call_started":
        handleGroupCallStarted(message);
        showNotification(`👥 ${message.fromUserName} начал групповой звонок`, {
          body: "Нажмите чтобы присоединиться",
          tag: "group-call-started",
          actions: [
            {
              action: "join-call",
              title: "👥 Присоединиться",
            },
          ],
        });
        break;
      case "group_call_ended":
        handleGroupCallEnded(message);
        break;
      case "active_calls":
        handleActiveCalls(message);
        break;
      case "online_users":
        if (message.users && Array.isArray(message.users)) {
          console.log("📋 Online users updated:", message.users.length);
          updateUsersList(message.users);
        }
        break;
      case "error":
        handleErrorMessage(message);
        break;

      default:
        console.log("❌ Unknown message type:", message);
    }
  }
    
  // Функция загрузки файлов
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log("📤 Uploading file:", file.name, file.size);

    // Проверка размера файла (макс 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showSystemMessage("❌ Файл слишком большой (макс 10MB)");
      fileInput.value = "";
      return;
    }

    showSystemMessage("🔄 Загрузка файла...");

    const reader = new FileReader();
    reader.onload = function(e) {
      const base64 = e.target.result.split(',')[1];
      
      sendMessage({
        type: "file",
        filename: file.name,
        filetype: file.type,
        size: file.size,
        data: base64
      });

      showSystemMessage(`✅ Файл "${file.name}" отправлен`);
      
      // Воспроизводим звук
      playSound('file');
      
      // Показываем уведомление
      if (window.backgroundNotifications) {
        window.backgroundNotifications.sendIfHidden(
          "📎 Файл отправлен",
          file.name,
          { type: 'file', filename: file.name }
        );
      }
    };

    reader.onerror = function() {
      showSystemMessage("❌ Ошибка чтения файла");
    };

    reader.readAsDataURL(file);
    fileInput.value = ""; // Сброс input для повторной загрузки
  }
    
  function handleErrorMessage(message) {
    console.error("❌ Server error:", message);
    showSystemMessage(message.message || "❌ Произошла ошибка на сервере");
  }
    
  function handleInitMessage(message) {
    mySessionId = message.sessionId;
    myId = message.id;

    // Просто показываем имя из сервера
    if (nameInput) {
      nameInput.value = message.name;
    }

    // Если есть сохраненное имя, показываем его
    const savedName = localStorage.getItem("chatUserName");
    if (savedName && nameInput) {
      nameInput.value = savedName;
    }
  }

  function handleHistoryMessage(message) {
    if (!historyLoaded && message.history) {
      message.history.forEach((msg) => {
        switch (msg.type) {
          case "message":
            showMessage(msg, true);
            break;
          case "system":
            showSystemMessage(msg.content, true);
            break;
          case "action":
            showActionMessage(msg, true);
            break;
          case "file":
            if (msg.filetype && msg.filetype.startsWith("audio/")) {
              showVoiceMessage(msg, true);
            } else {
              showFileMessage(msg, true);
            }
            break;
          case "sticker":
            if (msg.sticker && msg.sticker.emoji) {
              showStickerMessage(msg, true);
            }
            break;
        }
      });
      historyLoaded = true;
    }
  }

  // Отправка сообщений с диагностикой
  function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("❌ Error sending message:", error);
        showSystemMessage(`❌ Ошибка отправки: ${error.message}`);
      }
    } else {
      const state = ws ? ws.readyState : 'null';
      console.log(`❌ WebSocket not ready. State: ${state}`);
      showSystemMessage(`❌ Нет соединения (состояние: ${state})`);
      
      if (!isConnected) {
        showSystemMessage("🔄 Попытка переподключения...");
        connectWebSocket();
      }
    }
  }

  function handleMessageSubmit(e) {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (text && isConnected) {
      sendMessage({ type: "message", text });
      messageInput.value = "";
      messageInput.focus();
    }
  }

  // Обработчики сообщений для видеозвонков
  function handleRoomCreated(message) {
    console.log("📥 Room created:", message);
    currentRoomId = message.roomId;
    isInCall = true;
    isCallInitiator = true;
    
    if (videoCallContainer) {
      videoCallContainer.classList.remove("hidden");
    }
    
    showSystemMessage(message.message || "✅ Комната звонка создана");
    
    // Инициализируем локальный стрим если ещё нет
    if (!localStream) {
      initializeLocalStream().catch(err => {
        console.error("❌ Failed to init stream:", err);
        showSystemMessage("⚠️ Камера недоступна");
      });
    }
  }

  function handleRoomUsers(message) {
    console.log("👥 Room users:", message);
    if (message.users && Array.isArray(message.users)) {
      // Обновляем отображение участников
      updateCallParticipantsUI(message.users);
    }
  }

  function updateCallParticipantsUI(participants) {
    // Функция для обновления UI участников звонка
    console.log("🔄 Updating call participants UI:", participants);
    // Здесь можно добавить визуализацию участников
  }

  function handleUserJoined(message) {
    console.log("👤 User joined:", message);
    showSystemMessage(`👤 ${message.username || 'Пользователь'} присоединился к звонку`);
    
    // Воспроизводим звук
    playSound('join');
    
    // Уведомление
    if (window.backgroundNotifications) {
      window.backgroundNotifications.sendIfHidden(
        "Новый участник",
        `${message.username} присоединился к звонку`,
        { type: 'call' }
      );
    }
  }

  function handleUserLeft(message) {
    console.log("👋 User left:", message);
    showSystemMessage(`👋 Пользователь покинул звонок`);
  }

  function handleGroupCallStarted(message) {
    console.log("📞 Group call started:", message);
    showSystemMessage(`👥 ${message.fromUserName || 'Пользователь'} начал групповой звонок`);
    
    // Сохраняем информацию о звонке
    currentRoomId = message.roomId;
    
    // Воспроизводим звук
    playSound('call');
    
    // Показываем кнопку присоединения
    if (videoCallContainer) {
      videoCallContainer.classList.remove("hidden");
    }
  }

  function handleGroupCallEnded(message) {
    console.log("📴 Group call ended:", message);
    showSystemMessage("📴 Групповой звонок завершён");
    
    // Очищаем состояние
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    currentRoomId = null;
    isInCall = false;
    
    if (videoCallContainer) {
      videoCallContainer.classList.add("hidden");
    }
  }

  // Индивидуальные звонки
  function handleCallInvite(message) {
    console.log("📞 Incoming call:", message);
    
    incomingCall = {
      callId: message.callId,
      roomId: message.roomId,
      fromSessionId: message.fromSessionId,
      fromUserId: message.fromUserId,
      fromUsername: message.fromUsername,
      isVideo: message.isVideo
    };
    
    showSystemMessage(`📞 ${message.fromUsername} звонит вам...`);
    
    // Показываем UI для принятия/отклонения звонка
    if (incomingCallModal) {
      incomingCallModal.classList.remove("hidden");
      const callerNameEl = document.getElementById("callerName");
      if (callerNameEl) {
        callerNameEl.textContent = message.fromUsername;
      }
    }
  }

  function handleCallStarted(message) {
    console.log("📞 Call started:", message);
    currentRoomId = message.roomId;
    isInCall = true;
    
    if (videoCallContainer) {
      videoCallContainer.classList.remove("hidden");
    }
    
    showSystemMessage("✅ Звонок начат");
  }

  function handleCallRejected(message) {
    console.log("❌ Call rejected:", message);
    showSystemMessage(`❌ ${message.fromUsername} отклонил звонок`);
    
    // Очищаем состояние
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    
    currentRoomId = null;
    isInCall = false;
    
    if (videoCallContainer) {
      videoCallContainer.classList.add("hidden");
    }
  }

  function handleActiveCalls(message) {
    console.log("📞 Active calls:", message);
    // Показываем информацию об активных звонках
    if (message.calls && message.calls.length > 0) {
      showSystemMessage(`👥 Активно звонков: ${message.calls.length}`);
    }
  }

  // WebRTC функции для звонков
  function handleWebRTCOffer(message) {
    console.log("🔄 WebRTC offer received:", message);
    
    // Создаём или обновляем пир-соединение
    const peerConnection = getOrCreatePeerConnection(message.fromSessionId);
    
    peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
      .then(() => {
        return peerConnection.createAnswer();
      })
      .then(answer => {
        return peerConnection.setLocalDescription(answer);
      })
      .then(() => {
        sendMessage({
          type: "webrtc_answer",
          targetSessionId: message.fromSessionId,
          roomId: message.roomId,
          answer: peerConnection.localDescription
        });
      })
      .catch(err => {
        console.error("❌ Error handling WebRTC offer:", err);
      });
  }

  function handleWebRTCAnswer(message) {
    console.log("🔄 WebRTC answer received:", message);
    
    const peerConnection = peerConnections[message.fromSessionId];
    if (peerConnection) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer))
        .catch(err => {
          console.error("❌ Error setting remote description:", err);
        });
    }
  }

  function handleICECandidate(message) {
    console.log("🔄 ICE candidate received:", message);
    
    const peerConnection = peerConnections[message.fromSessionId];
    if (peerConnection && message.candidate) {
      peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate))
        .catch(err => {
          console.error("❌ Error adding ICE candidate:", err);
        });
    }
  }

  // Создание пир-соединения
  function getOrCreatePeerConnection(remoteSessionId) {
    if (peerConnections[remoteSessionId]) {
      return peerConnections[remoteSessionId];
    }

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(config);
    peerConnections[remoteSessionId] = pc;

    // Добавляем локальный стрим
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          type: "webrtc_ice_candidate",
          targetSessionId: remoteSessionId,
          roomId: currentRoomId,
          candidate: event.candidate
        });
      }
    };

    // Обработка удалённого стрима
    pc.ontrack = (event) => {
      console.log("📹 Remote track received:", event.streams[0]);
      handleRemoteStream(event.streams[0], remoteSessionId);
    };

    pc.onconnectionstatechange = () => {
      console.log("📡 Connection state:", pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        handlePeerDisconnected(remoteSessionId);
      }
    };

    return pc;
  }

  function handleRemoteStream(stream, sessionId) {
    console.log("📹 Handling remote stream:", sessionId);
    // Создаём видео элемент для удалённого пользователя
    const videoContainer = document.getElementById("videoGrid");
    if (!videoContainer) return;

    let remoteVideo = document.getElementById(`remoteVideo_${sessionId}`);
    if (!remoteVideo) {
      remoteVideo = document.createElement("video");
      remoteVideo.id = `remoteVideo_${sessionId}`;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.className = "remote-video";
      videoContainer.appendChild(remoteVideo);
    }

    remoteVideo.srcObject = stream;
    updateVideoGridLayout();
  }

  function handlePeerDisconnected(sessionId) {
    console.log("👋 Peer disconnected:", sessionId);
    const remoteVideo = document.getElementById(`remoteVideo_${sessionId}`);
    if (remoteVideo) {
      remoteVideo.remove();
    }
    
    if (peerConnections[sessionId]) {
      peerConnections[sessionId].close();
      delete peerConnections[sessionId];
    }
    
    updateVideoGridLayout();
  }

  // Отображение сообщений
  function showMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = `message ${data.id === myId ? "me" : ""}`;

    const time = data.ts
      ? new Date(data.ts).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        });

    el.innerHTML = `
      <div class="message-header">
        <strong>${escapeHtml(data.name)}</strong>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-text">${escapeHtml(data.text)}</div>
    `;

    addMessage(el, isHistory);
    
    if (!isHistory && data.id !== myId) {
      playMeowSound(); // Воспроизводим мяу при новых сообщениях
    }
  }

  function showSystemMessage(text, isHistory = false) {
    const el = document.createElement("div");
    el.className = "system";
    el.textContent = text;
    addMessage(el, isHistory);
    
    if (!isHistory) {
      if (text.includes('присоединился') || text.includes('вошёл')) {
        playSound('join');
      } else if (text.includes('покинул') || text.includes('вышел')) {
        playSound('leave');
      } else if (text.includes('звонок') || text.includes('Звонок')) {
        playSound('call');
      }
    }
  }

  function addMessage(element, isHistory = false) {
    if (!messagesEl) return;
    if (isHistory) {
      messagesEl.insertBefore(element, messagesEl.firstChild);
    } else {
      messagesEl.appendChild(element);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function showActionMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = "action";
    el.textContent = `${data.name} ${data.text}`;
    addMessage(el, isHistory);
  }

  function showReactionMessage(data) {
    const el = document.createElement("div");
    el.className = "reaction";
    el.textContent = `${data.name} отправил реакцию ${data.emoji}`;
    addMessage(el);
  }

  function showStickerMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = `message sticker-message ${data.id === myId ? "me" : ""}`;
    
    const time = data.ts
      ? new Date(data.ts).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        });

    // Проверяем наличие стикера с улучшенной обработкой
    let stickerEmoji = '🎭';
    let stickerName = 'Стикер';
    
    if (data.sticker) {
      stickerEmoji = data.sticker.emoji || data.emoji || '🎭';
      stickerName = data.sticker.name || data.name || 'Стикер';
    } else if (data.emoji) {
      stickerEmoji = data.emoji;
      stickerName = 'Эмодзи';
    } else {
      console.warn('Invalid sticker data:', data);
      // Не возвращаемся, а показываем дефолтный стикер
    }

    el.innerHTML = `
      <div class="message-header">
        <strong>${escapeHtml(data.name)}</strong>
        <span class="message-time">${time}</span>
      </div>
      <div class="sticker-content">
        <span class="sticker-emoji">${stickerEmoji}</span>
        <span class="sticker-name">${stickerName}</span>
      </div>
    `;

    addMessage(el, isHistory);
  }

  function showPollMessage(poll, isHistory = false) {
    const el = document.createElement("div");
    el.className = "poll-message";
    el.id = `poll_${poll.id}`;
    
    const expiresText = poll.expiresAt 
      ? `Истекает: ${new Date(poll.expiresAt).toLocaleString("ru-RU")}`
      : "Без ограничения времени";
    
    el.innerHTML = `
      <div class="poll-header">
        <strong>📊 Опрос от ${poll.creatorName}</strong>
        <span class="poll-expires">${expiresText}</span>
      </div>
      <div class="poll-question">${escapeHtml(poll.question)}</div>
      <div class="poll-options" id="poll_options_${poll.id}">
        ${poll.options.map((option, index) => `
          <button class="poll-option" onclick="votePoll(${poll.id}, ${index})">
            <span class="option-text">${escapeHtml(option)}</span>
            <span class="option-votes" id="poll_${poll.id}_option_${index}">0 голосов</span>
          </button>
        `).join('')}
      </div>
    `;

    addMessage(el, isHistory);
  }

  function showGameMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = "game-message";
    el.id = `game_${data.gameId}`;
    
    el.innerHTML = `
      <div class="game-header">
        <strong>🎮 ${data.creator} создал игру: ${data.gameType}</strong>
      </div>
      <div class="game-controls">
        <button class="join-game-btn" onclick="joinGame(${data.gameId})">
          Присоединиться
        </button>
        <span class="game-participants" id="game_participants_${data.gameId}">1 игрок</span>
      </div>
    `;

    addMessage(el, isHistory);
  }

  // Убрано: showLevelUpMessage

  function showFileMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = `message file-message ${data.id === myId ? "me" : ""}`;

    let previewHtml = "";
    if (data.filetype && data.filetype.startsWith("image/")) {
      previewHtml = `<img style="max-width:100%;max-height:300px;height:auto;object-fit:contain;border-radius:8px;background:var(--bg-tertiary);" src="data:${data.filetype};base64,${data.data}" alt="${data.filename}" loading="lazy">`;
    } else if (data.filetype && data.filetype.startsWith("video/")) {
      previewHtml = `<video style="max-width:100%;max-height:300px;border-radius:8px;background:var(--bg-tertiary);" controls><source src="data:${data.filetype};base64,${data.data}" type="${data.filetype}"></video>`;
    } else if (data.filetype && data.filetype.startsWith("audio/")) {
      previewHtml = `<audio controls style="width:100%"><source src="data:${data.filetype};base64,${data.data}" type="${data.filetype}"></audio>`;
    } else {
      previewHtml = `<div class="file-icon">📄 ${data.filename}</div>`;
    }

    const time = data.ts
      ? new Date(data.ts).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        });

    el.innerHTML = `
      <div class="message-header">
        <strong>${escapeHtml(data.name)}</strong>
        <span class="message-time">${time}</span>
      </div>
      <div class="file-preview">
        ${previewHtml}
        <div class="file-info">
          <div class="file-name">${escapeHtml(data.filename)}</div>
          <div class="file-size">${formatFileSize(data.size)}</div>
          <button class="download-btn" onclick="downloadFile('${
            data.filename
          }', '${data.filetype}', '${data.data}')">
            Скачать
          </button>
        </div>
      </div>
    `;

    addMessage(el, isHistory);
  }

  function showVoiceMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = `message voice-message ${data.id === myId ? "me" : ""}`;

    const time = data.ts
      ? new Date(data.ts).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        });

    el.innerHTML = `
      <div class="message-header">
        <strong>${escapeHtml(data.name)}</strong>
        <span class="message-time">${time}</span>
      </div>
      <div class="voice-player">
        <audio controls style="width: 100%;">
          <source src="data:${data.filetype || "audio/webm"};base64,${
      data.data
    }" type="${data.filetype || "audio/webm"}">
          Ваш браузер не поддерживает аудио
        </audio>
      </div>
    `;

    addMessage(el, isHistory);
  }

  function addMessage(element, isHistory = false) {
    if (!messagesEl) return;

    if (isHistory) {
      messagesEl.insertBefore(element, messagesEl.firstChild);
    } else {
      messagesEl.appendChild(element);
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  // ИСПРАВЛЕННАЯ ЗАПИСЬ ГОЛОСОВЫХ СООБЩЕНИЙ
  async function startVoiceRecording() {
    console.log(
      "🎤 Start voice recording called, current state - isRecording:",
      isRecording
    );

    if (isRecording) {
      console.log("🔄 Already recording, stopping...");
      stopVoiceRecording();
      return;
    }

    try {
      console.log("🎤 Starting voice recording process...");

      // Сначала показываем модальное окно
      if (voiceRecordModal) {
        voiceRecordModal.classList.remove("hidden");
        if (voiceRecordTimer) {
          voiceRecordTimer.textContent = "00:00";
          voiceRecordTimer.style.color = "";
        }
        console.log("✅ Modal shown");
      } else {
        console.error("❌ Voice record modal not found!");
        showSystemMessage("❌ Ошибка: окно записи не найдено");
        return;
      }

      // Обновляем кнопку
      voiceMessageBtn.classList.add("recording");
      voiceMessageBtn.textContent = "⏹️";
      voiceMessageBtn.style.background = "#dc2626";
      console.log("✅ Button updated");

      // Запрашиваем доступ к микрофону
      console.log("🎤 Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        },
      });
      console.log("✅ Microphone access granted");

      // Создаем MediaRecorder
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "",
      ];

      // СОХРАНЯЕМ mediaRecorder в ГЛОБАЛЬНУЮ ПЕРЕМЕННУЮ
      mediaRecorder = null;
      for (const mimeType of mimeTypes) {
        try {
          if (!mimeType || MediaRecorder.isTypeSupported(mimeType)) {
            mediaRecorder = new MediaRecorder(stream, {
              mimeType,
              audioBitsPerSecond: 128000,
            });
            console.log("✅ Using format:", mimeType || "default");
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!mediaRecorder) {
        mediaRecorder = new MediaRecorder(stream);
        console.log("✅ Using default format");
      }

      // ДЕЛАЕМ mediaRecorder ГЛОБАЛЬНО ДОСТУПНЫМ
      window.currentMediaRecorder = mediaRecorder;

      audioChunks = [];
      console.log("🎯 MediaRecorder created:", mediaRecorder);

      mediaRecorder.ondataavailable = (event) => {
        console.log("📦 Data available:", event.data.size, "bytes");
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = handleRecordingStop;

      mediaRecorder.onstart = () => {
        console.log("✅ Recording started successfully");
        isRecording = true;
        recordingStartTime = Date.now();
        startRecordingTimer();
        startVisualization(stream);
        showSystemMessage("🎤 Запись начата...");
      };
      
      mediaRecorder.onerror = (event) => {
        console.error("❌ MediaRecorder error:", event.error);
        showSystemMessage("❌ Ошибка записи");
        cancelVoiceRecording();
      };
      
      // Начинаем запись
      try {
        mediaRecorder.start(100); // 100ms chunks
        console.log(
          "🎯 MediaRecorder started with timeslice, state:",
          mediaRecorder.state
        );
      } catch (error) {
        console.error("❌ Failed to start MediaRecorder:", error);
        showSystemMessage("❌ Не удалось начать запись");
        cancelVoiceRecording();
      }
    } catch (error) {
      console.error("❌ Error starting voice recording:", error);

      let errorMessage = "❌ Не удалось начать запись";
      if (error.name === "NotAllowedError") {
        errorMessage = "❌ Разрешение на использование микрофона отклонено";
      } else if (error.name === "NotFoundError") {
        errorMessage = "❌ Микрофон не найден";
      } else if (error.name === "NotSupportedError") {
        errorMessage = "❌ Ваш браузер не поддерживает запись аудио";
      }

      showSystemMessage(errorMessage);
      cancelVoiceRecording();
    }
  }

  function startVisualization(stream) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      visualizationInterval = setInterval(() => {
        if (!isRecording) return;

        analyser.getByteFrequencyData(dataArray);

        visualizationBars.forEach((bar, index) => {
          const value =
            dataArray[
              Math.floor((index * bufferLength) / visualizationBars.length)
            ] || 0;
          const height = Math.max(2, (value / 255) * 50 + 5);
          bar.style.height = `${height}px`;
          bar.style.background = `hsl(${200 + (value / 255) * 60}, 100%, 50%)`;
        });
      }, 100);
    } catch (error) {
      console.warn("⚠️ Audio visualization failed:", error);
    }
  }

  function startRecordingTimer() {
    if (recordingTimer) clearInterval(recordingTimer);

    recordingTimer = setInterval(() => {
      if (!isRecording) return;

      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (elapsed % 60).toString().padStart(2, "0");

      if (voiceRecordTimer) {
        voiceRecordTimer.textContent = `${minutes}:${seconds}`;
      }

      // Автоматическая остановка через 2 минуты
      if (elapsed >= 120) {
        stopVoiceRecording();
      }
    }, 1000);
  }

  function stopVoiceRecording() {
    console.log("🛑 stopVoiceRecording called");

    // Используем глобальную переменную если локальная null
    const recorderToUse = mediaRecorder || window.currentMediaRecorder;

    if (!recorderToUse) {
      console.error("❌ No mediaRecorder instance!");
      cleanupRecording();
      return;
    }

    console.log("MediaRecorder state:", recorderToUse.state);

    try {
      if (recorderToUse.state === "recording") {
        console.log("✅ Stopping media recorder...");
        recorderToUse.stop();

        // Показываем статус обработки
        if (voiceRecordTimer) {
          voiceRecordTimer.textContent = "🔄 Обработка...";
          voiceRecordTimer.style.color = "var(--primary-blue)";
        }
      } else {
        console.log("⚠️ MediaRecorder not recording, cleaning up...");
        cleanupRecording();
      }
    } catch (error) {
      console.error("❌ Error in stopVoiceRecording:", error);
      cleanupRecording();
      showSystemMessage("❌ Ошибка остановки записи");
    }
  }

  function cancelVoiceRecording() {
    console.log("❌ Canceling recording...");

    // Используем глобальную переменную если локальная null
    const recorderToUse = mediaRecorder || window.currentMediaRecorder;

    if (recorderToUse && recorderToUse.state === "recording") {
      try {
        console.log("🛑 Stopping media recorder due to cancel");
        recorderToUse.stop();
      } catch (error) {
        console.error("Error stopping media recorder:", error);
      }
    }

    cleanupRecording();
    showSystemMessage("❌ Запись отменена");
  }

  function cleanupRecording() {
    isRecording = false;

    // Останавливаем все потоки
    const recorderToUse = mediaRecorder || window.currentMediaRecorder;
    if (recorderToUse && recorderToUse.stream) {
      recorderToUse.stream.getTracks().forEach((track) => {
        track.stop();
        console.log("🔇 Stopped track:", track.kind);
      });
    }

    // Очищаем переменные
    mediaRecorder = null;
    window.currentMediaRecorder = null;

    // Очищаем интервалы
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }

    if (visualizationInterval) {
      clearInterval(visualizationInterval);
      visualizationInterval = null;
    }

    // Сбрасываем визуализацию
    visualizationBars.forEach((bar) => {
      bar.style.height = "2px";
      bar.style.background = "var(--primary-red)";
    });

    // Закрываем AudioContext
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }

    // Скрываем модальное окно
    if (voiceRecordModal) {
      voiceRecordModal.classList.add("hidden");
    }

    // Восстанавливаем кнопку
    voiceMessageBtn.classList.remove("recording");
    voiceMessageBtn.textContent = "🎤";
    voiceMessageBtn.style.background = "";
  }

  async function handleRecordingStop() {
    console.log("🔄 Processing recording stop...");

    try {
      if (audioChunks.length === 0) {
        console.warn("⚠️ No audio chunks recorded");
        showSystemMessage("❌ Запись отсутствует или слишком короткая");
        cleanupRecording();
        return;
      }

      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
      console.log(
        `⏱️ Recording duration: ${duration}s, chunks: ${audioChunks.length}`
      );

      if (duration < 1) {
        showSystemMessage("❌ Запись слишком короткая (минимум 1 секунда)");
        cleanupRecording();
        return;
      }

      showSystemMessage("🔄 Обработка записи...");

      // Создаем Blob из chunks
      const audioBlob = new Blob(audioChunks, {
        type: "audio/webm", // Используем фиксированный тип для надежности
      });

      console.log("📦 Audio blob created:", {
        size: audioBlob.size,
        type: audioBlob.type,
        duration: duration,
      });

      if (audioBlob.size === 0) {
        showSystemMessage("❌ Запись пустая");
        cleanupRecording();
        return;
      }

      // Конвертируем в base64
      const reader = new FileReader();

      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        console.log("✅ Base64 conversion successful, length:", base64.length);

        if (!base64 || base64.length < 100) {
          showSystemMessage("❌ Ошибка конвертации записи");
          cleanupRecording();
          return;
        }

        // Отправляем сообщение
        sendMessage({
          type: "file",
          filename: `voice_${Date.now()}.webm`,
          filetype: "audio/webm",
          size: audioBlob.size,
          data: base64,
          duration: duration,
        });

        showSystemMessage("✅ Голосовое сообщение отправлено");
        cleanupRecording();
      };

      reader.onerror = (error) => {
        console.error("❌ Error reading audio blob:", error);
        showSystemMessage("❌ Ошибка обработки записи");
        cleanupRecording();
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error("❌ Error processing recording:", error);
      showSystemMessage("❌ Ошибка обработки записи");
      cleanupRecording();
    } finally {
      // Всегда очищаем chunks
      audioChunks = [];
      console.log("🧹 Audio chunks cleared");
    }
  }

  // Уведомления
  async function initializeNotifications() {
    try {
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === "granted";

        if (notificationPermission) {
          console.log("✅ Уведомления разрешены");
        }
      }
    } catch (error) {
      console.error("❌ Ошибка инициализации уведомлений:", error);
    }
  }

  function showNotification(title, options = {}) {
    if (!notificationPermission) return;

    // Всегда воспроизводим звук мяу при уведомлениях
    playSound('notification');

    if (document.hidden) {
      if ("serviceWorker" in navigator && serviceWorkerRegistration) {
        serviceWorkerRegistration.showNotification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          vibrate: [200, 100, 200],
          requireInteraction: true,
          ...options,
        });
      } else if ("Notification" in window) {
        new Notification(title, {
          icon: "/favicon.ico",
          requireInteraction: true,
          ...options,
        });
      }
    }
  }

  function notifyNewMessage(message) {
    // Используем новую систему уведомлений
    if (window.backgroundNotifications) {
      window.backgroundNotifications.sendIfHidden(
        `Новое сообщение от ${message.name}`,
        message.text || "📎 Вложение",
        {
          messageId: message.id,
          sender: message.name,
          type: 'message'
        }
      );
    }
    
    // Старая система как fallback
    showNotification(`Новое сообщение от ${message.name}`, {
      body: message.text || "📎 Вложение",
      tag: "new-message",
      requireInteraction: true,
    });
  }

  function notifyIncomingCall(callInfo) {
    // Используем новую систему уведомлений
    if (window.backgroundNotifications) {
      window.backgroundNotifications.sendBackgroundMessage(
        `Входящий звонок от ${callInfo.fromUserName}`,
        callInfo.isGroupCall ? "👥 Групповой звонок" : "📞 Индивидуальный звонок",
        {
          callId: callInfo.roomId,
          caller: callInfo.fromUserName,
          type: 'call'
        }
      );
    }
    
    // Старая система как fallback
    showNotification(`Входящий звонок от ${callInfo.fromUserName}`, {
      body: callInfo.isGroupCall
        ? "👥 Групповой звонок"
        : "📞 Индивидуальный звонок",
      tag: "incoming-call",
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
    });
  }

  function notifySystemEvent(title, body) {
    // Используем новую систему уведомлений
    if (window.backgroundNotifications) {
      window.backgroundNotifications.sendIfHidden(title, body, {
        type: 'system'
      });
    }
    
    // Старая система как fallback
    showNotification(title, {
      body: body,
      tag: "system-event",
    });
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (incomingCall) {
        notifyIncomingCall(incomingCall);
      }
    }
  }

  // Функция для запроса разрешения на уведомления
  async function requestNotificationPermission() {
    try {
      if (!("Notification" in window)) {
        showSystemMessage("❌ Уведомления не поддерживаются в этом браузере");
        return;
      }

      if (Notification.permission === "granted") {
        notificationPermission = true;
        showSystemMessage("✅ Уведомления уже разрешены");
        updateNotificationButton();
        return;
      }
      
      if (Notification.permission === "denied") {
        showSystemMessage("❌ Уведомления заблокированы. Разрешите их в настройках браузера");
        return;
      }
      
      // Запрашиваем разрешение
      const permission = await Notification.requestPermission();
      
      if (permission === "granted") {
        notificationPermission = true;
        showSystemMessage("✅ Уведомления включены! Теперь вы будете получать уведомления о новых сообщениях и звонках");
        updateNotificationButton();
        
        // Показываем тестовое уведомление
        setTimeout(() => {
          showNotification("🔔 Уведомления работают!", {
            body: "Вы будете получать уведомления о новых сообщениях",
            tag: "test-notification"
          });
        }, 1000);
        
      } else if (permission === "denied") {
        showSystemMessage("❌ Разрешение на уведомления отклонено");
        updateNotificationButton();
      } else {
        showSystemMessage("⚠️ Разрешение на уведомления не получено");
        updateNotificationButton();
      }
      
    } catch (error) {
      console.error("Ошибка запроса разрешения на уведомления:", error);
      showSystemMessage("❌ Ошибка при включении уведомлений");
    }
  }

  // Функция для обновления состояния кнопки уведомлений
  function updateNotificationButton() {
    if (!enableNotificationsBtn) return;
    
    if (notificationPermission) {
      enableNotificationsBtn.innerHTML = "🔔 Уведомления включены";
      enableNotificationsBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      enableNotificationsBtn.disabled = true;
    } else {
      enableNotificationsBtn.innerHTML = "🔔 Включить уведомления";
      enableNotificationsBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      enableNotificationsBtn.disabled = false;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Работа с пользователями
  function updateUsersList(usersList) {
    if (!userListEl) return;

    userListEl.innerHTML = "";
    if (onlineCount) {
      onlineCount.textContent = `Онлайн: ${usersList.length}`;
    }

    users.clear();
    usersList.forEach((user) => {
      users.set(user.id, user);

      const userEl = document.createElement("li");
      userEl.className = `user-item ${user.id === myId ? "me" : ""}`;

      let userHtml = `
        <span class="user-status online"></span>
        <span class="user-name">${escapeHtml(user.name)}</span>
        ${user.id === myId ? '<span class="you-badge">(Вы)</span>' : ""}
      `;

      if (user.id !== myId) {
        userHtml += `<button class="call-user-btn" title="Позвонить">📞</button>`;
      }

      userEl.innerHTML = userHtml;

      if (user.id !== myId) {
        const callBtn = userEl.querySelector(".call-user-btn");
        if (callBtn) {
          callBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            startIndividualCall(user.id);
          });
        }

        userEl.addEventListener("click", () => {
          const text = prompt(`Приватное сообщение для ${user.name}:`);
          if (text && text.trim()) {
            sendMessage({ type: "private", to: user.id, text: text.trim() });
          }
        });
      }

      userListEl.appendChild(userEl);
    });

    if (!isInCall) {
      const joinCallItem = document.createElement("li");
      joinCallItem.className = "user-item join-call-item";
      joinCallItem.innerHTML = `
      <span class="user-status" style="background: #f59e0b"></span>
      <span class="user-name">Присоединиться к групповому звонку</span>
      <button class="call-user-btn" style="background: #f59e0b">👥</button>
    `;

      const joinBtn = joinCallItem.querySelector(".call-user-btn");
      joinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showActiveCallsModal();
      });

      joinCallItem.addEventListener("click", () => {
        showActiveCallsModal();
      });

      userListEl.appendChild(joinCallItem);
    }
  }

  function showActiveCallsModal() {
    if (!activeCallsModal) {
      activeCallsModal = document.createElement("div");
      activeCallsModal.className = "modal";
      activeCallsModal.innerHTML = `
      <div class="modal-content">
        <h3>Активные групповые звонки</h3>
        <div id="activeCallsList" style="max-height: 300px; overflow-y: auto; margin: 16px 0;">
          <div class="system">Загрузка...</div>
        </div>
        <div class="modal-buttons">
          <button id="refreshCalls" class="accept-btn">🔄 Обновить</button>
          <button id="closeCallsModal" class="reject-btn">✕ Закрыть</button>
        </div>
      </div>
    `;
      document.body.appendChild(activeCallsModal);

      document
        .getElementById("refreshCalls")
        .addEventListener("click", refreshActiveCalls);
      document
        .getElementById("closeCallsModal")
        .addEventListener("click", hideActiveCallsModal);
    }

    activeCallsModal.classList.remove("hidden");
    refreshActiveCalls();
  }
  
  function hideActiveCallsModal() {
    if (activeCallsModal) {
      activeCallsModal.classList.add("hidden");
    }
  }

  function refreshActiveCalls() {
    sendMessage({ type: "get_active_calls" });
  }

  function handleActiveCalls(message) {
    activeCalls = message.calls;

    const callsList = document.getElementById("activeCallsList");
    if (!callsList) return;

    if (activeCalls.length === 0) {
      callsList.innerHTML =
        '<div class="system">Нет активных групповых звонков</div>';
      return;
    }
    
    callsList.innerHTML = "";
    activeCalls.forEach((call) => {
      const callEl = document.createElement("div");
      callEl.className = "user-item";
      callEl.style.marginBottom = "8px";
      callEl.style.cursor = "pointer";
      callEl.style.padding = "12px";
      callEl.style.borderRadius = "8px";
      callEl.style.border = "1px solid var(--border-color)";

      callEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div>
          <div style="font-weight: 500;">Звонок от ${escapeHtml(
            call.creatorName
          )}</div>
          <div style="font-size: 12px; color: var(--text-muted);">
            Участников: ${call.participantsCount} • 
            ${new Date(call.createdAt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        <button class="call-user-btn" style="background: #10b981;">➕</button>
      </div>
    `;

      const joinBtn = callEl.querySelector(".call-user-btn");
      joinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        joinGroupCall(call.roomId);
      });

      callEl.addEventListener("click", () => {
        joinGroupCall(call.roomId);
      });

      callsList.appendChild(callEl);
    });
  }

  function joinGroupCall(roomId) {
    if (isInCall) {
      showSystemMessage("❌ Вы уже в звонке");
      return;
    }
    
    hideActiveCallsModal();
    showSystemMessage("🎥 Запрашиваем доступ к камере и микрофону...");

    try {
      initializeLocalStream()
        .then(() => {
          currentRoomId = roomId;
          isInCall = true;
          isCallInitiator = false;

          sendMessage({ type: "join_group_call", roomId: roomId });
          showVideoCallUI();
          showSystemMessage("✅ Вы присоединились к групповому звонку");
        })
        .catch((error) => {
          console.error("Error joining group call:", error);
          showSystemMessage("❌ Ошибка присоединения к звонку");
        });
    } catch (error) {
      console.error("Error joining group call:", error);
      showSystemMessage("❌ Ошибка присоединения к звонку");
    }
  }

  function handleGroupCallStarted(message) {
    if (isInCall) return;

    showSystemMessage(`👥 ${message.fromUserName} начал групповой звонок`);

    if (!document.querySelector(".quick-join-call")) {
      const quickJoin = document.createElement("div");
      quickJoin.className = "system quick-join-call";
      quickJoin.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        ${message.fromUserName} начал групповой звонок
        <button style="background: var(--primary-blue); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">
          Присоединиться
        </button>
      </div>
    `;

      const joinBtn = quickJoin.querySelector("button");
      joinBtn.addEventListener("click", () => {
        joinGroupCall(message.roomId);
        quickJoin.remove();
      });

      addMessage(quickJoin);
    }
  }

  function handleGroupCallEnded(message) {
    showSystemMessage(
      `📞 Групповой звонок завершен ${
        message.endedBy ? `пользователем ${message.endedBy}` : ""
      }`
    );

    document.querySelectorAll(".quick-join-call").forEach((el) => el.remove());
  }

  function handlePrivateMessage(data) {
    const el = document.createElement("div");
    el.className = "private";

    el.innerHTML = `
      <div class="message-header">
        <strong>🔒 ЛС от ${escapeHtml(data.name)}</strong>
        <span class="message-time">${new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        })}</span>
      </div>
      <div class="message-text">${escapeHtml(data.text)}</div>
    `;

    addMessage(el);
  }

  // Загрузка файлов
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showSystemMessage("❌ Файл слишком большой (максимум 10MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(",")[1];
      sendMessage({
        type: "file",
        filename: file.name,
        filetype: file.type,
        size: file.size,
        data: base64,
      });
    };
    reader.onerror = () => {
      showSystemMessage("❌ Ошибка чтения файла");
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  }

  // WebRTC функции
  async function startGroupCall() {
    if (isInCall) {
      showSystemMessage("❌ Вы уже в звонке");
      return;
    }

    try {
      showSystemMessage("🎥 Запрашиваем доступ к камере и микрофону...");
      
      // Проверяем поддержку WebRTC
      if (!window.RTCPeerConnection) {
        throw new Error("WebRTC не поддерживается в этом браузере");
      }
      
      await initializeLocalStream();
      isCallInitiator = true;
      
      // Создаем комнату с уникальным ID
      const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sendMessage({ type: "create_room", roomId });
      showSystemMessage("👥 Создаем групповой звонок...");
      
      // Добавляем обработку ошибок для WebSocket
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error("Нет подключения к серверу");
      }
      
    } catch (error) {
      console.error("Error starting group call:", error);
      
      let errorMessage = "❌ Не удалось начать звонок";
      if (error.message.includes("Permission denied")) {
        errorMessage = "❌ Разрешение на камеру/микрофон отклонено";
      } else if (error.message.includes("not found")) {
        errorMessage = "❌ Камера или микрофон не найдены";
      } else if (error.message.includes("WebRTC")) {
        errorMessage = "❌ WebRTC не поддерживается в этом браузере";
      } else if (error.message.includes("сервер")) {
        errorMessage = "❌ Нет подключения к серверу";
      }
      
      showSystemMessage(errorMessage);
      
      // Очищаем состояние при ошибке
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
      }
    }
  }

  function startIndividualCall(targetUserId) {
    if (isInCall) {
      showSystemMessage("❌ Вы уже в звонке");
      return;
    }
    
    isCallInitiator = true;
    sendMessage({ type: "start_individual_call", targetUserId });
    showSystemMessage("📞 Вызываем пользователя...");
  }

  async function initializeLocalStream(switchCamera = false) {
    try {
      console.log(`🎥 Initializing local stream, switchCamera: ${switchCamera}`);
      
      // Проверяем поддержку API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("API для работы с медиа не поддерживается");
      }

      // При обычной инициализации останавливаем старые треки
      if (!switchCamera && localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
          console.log(`🔇 Stopped ${track.kind} track`);
        });
        localStream = null;
      }

      // Получаем доступные камеры
      if (!switchCamera) {
        await getAvailableCameras();
      }
      
      // Более гибкие настройки для лучшей совместимости
      const constraints = {
        video: { 
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 24 },
          facingMode: currentCamera,
        },
        audio: switchCamera ? false : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      };

      if (switchCamera) {
        // Переключение камеры - только видео
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: constraints.video });
          const newVideoTrack = newStream.getVideoTracks()[0];

          if (newVideoTrack && localStream) {
            // Заменяем старый видео трек
            if (currentVideoTrack) {
              localStream.removeTrack(currentVideoTrack);
              currentVideoTrack.stop();
            }

            localStream.addTrack(newVideoTrack);
            currentVideoTrack = newVideoTrack;

            // Обновляем все видео элементы
            if (localVideo) {
              localVideo.srcObject = localStream;
            }
            
            const localVideoInGrid = document.getElementById("localVideoInGrid");
            if (localVideoInGrid) {
              localVideoInGrid.srcObject = localStream;
            }

            // Останавливаем временный поток
            newStream.getTracks().forEach(track => {
              if (track !== newVideoTrack) {
                track.stop();
              }
            });

            console.log("✅ Camera switched successfully");
            return localStream;
          }
        } catch (switchError) {
          console.warn("⚠️ Camera switch failed, trying fallback:", switchError);
          // При ошибке переключения пробуем без constraints
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = fallbackStream.getVideoTracks()[0];
          
          if (newVideoTrack && localStream) {
            if (currentVideoTrack) {
              localStream.removeTrack(currentVideoTrack);
              currentVideoTrack.stop();
            }
            localStream.addTrack(newVideoTrack);
            currentVideoTrack = newVideoTrack;
            
            if (localVideo) localVideo.srcObject = localStream;
            const localVideoInGrid = document.getElementById("localVideoInGrid");
            if (localVideoInGrid) localVideoInGrid.srcObject = localStream;
            
            fallbackStream.getTracks().forEach(track => {
              if (track !== newVideoTrack) track.stop();
            });
            
            return localStream;
          }
        }
      } else {
        // Полная инициализация с fallback
        try {
          localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (primaryError) {
          console.warn("⚠️ Primary constraints failed, trying fallback:", primaryError);
          
          // Fallback с более простыми настройками
          try {
            localStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
            });
          } catch (fallbackError) {
            // Последний fallback - только аудио
            console.warn("⚠️ Video+Audio failed, trying audio only:", fallbackError);
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            showSystemMessage("⚠️ Работаем только с аудио (камера недоступна)");
          }
        }
        
        currentVideoTrack = localStream.getVideoTracks()[0] || null;

        if (localVideo) {
          localVideo.srcObject = localStream;
          localVideo.muted = true;
        }

        console.log("✅ Local stream initialized", {
          video: localStream.getVideoTracks().length,
          audio: localStream.getAudioTracks().length
        });
        
        updateSwitchCameraButton();
        return localStream;
      }
    } catch (error) {
      console.error("❌ Error initializing local stream:", error);
      
      let errorMessage = "❌ Ошибка доступа к камере/микрофону";
      
      if (error.name === "NotAllowedError") {
        errorMessage = "❌ Разрешение на камеру/микрофон отклонено";
      } else if (error.name === "NotFoundError") {
        errorMessage = "❌ Камера или микрофон не найдены";
      } else if (error.name === "OverconstrainedError") {
        errorMessage = "❌ Несовместимые настройки камеры";
      } else if (error.name === "NotSupportedError") {
        errorMessage = "❌ API для работы с медиа не поддерживается";
      }
      
      showSystemMessage(errorMessage);
      throw error;
    }
  }

  // Новая функция для замены видео трека в peer connections
  async function replaceVideoTrackInPeerConnections(newVideoTrack) {
    const updatePromises = [];

    peerConnections.forEach((pc, sessionId) => {
      if (pc.signalingState === "stable") {
        const videoSender = pc
          .getSenders()
          .find((sender) => sender.track && sender.track.kind === "video");

        if (videoSender) {
          updatePromises.push(
            videoSender
              .replaceTrack(newVideoTrack)
              .then(() => {
                console.log(`✅ Video track replaced for ${sessionId}`);
              })
              .catch((error) => {
                console.error(
                  `❌ Failed to replace video track for ${sessionId}:`,
                  error
                );
                // Если не удалось заменить трек, пересоздаем offer
                recreateOfferForConnection(pc, sessionId);
              })
          );
        } else {
          // Если нет видео sender'а, создаем новый offer
          recreateOfferForConnection(pc, sessionId);
        }
      }
    });

    await Promise.allSettled(updatePromises);
  }

  // Функция для пересоздания offer при проблемах
  async function recreateOfferForConnection(pc, sessionId) {
    try {
      console.log(`🔄 Recreating offer for ${sessionId}`);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId: sessionId,
        offer,
      });

      console.log(`✅ Offer recreated for ${sessionId}`);
    } catch (error) {
      console.error(`❌ Failed to recreate offer for ${sessionId}:`, error);
    }
  }

  // Функция для получения доступных камер
  async function getAvailableCameras() {
    try {
      console.log("📷 Getting available cameras...");

      // Проверяем поддержку API
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("⚠️ Media devices API not supported");
        availableCameras = [];
        return [];
      }

      // Получаем список устройств
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === "videoinput");

      console.log(`📷 Found ${videoDevices.length} video devices:`, 
        videoDevices.map(d => ({
          id: d.deviceId.substring(0, 8) + "...",
          label: d.label || "Camera",
          groupId: d.groupId?.substring(0, 8) + "..."
        }))
      );

      availableCameras = videoDevices;
      return videoDevices;
    } catch (error) {
      console.error("❌ Error getting available cameras:", error);
      availableCameras = [];
      return [];
    }
  }



  // Основная функция переключения камеры
  async function switchCamera() {
    if (!isInCall || !localStream) {
      showSystemMessage("❌ Сначала присоединитесь к звонку");
      return;
    }

    try {
      showSystemMessage("🔄 Переключаем камеру...");
      
      // Переключаем режим камеры
      const newCamera = currentCamera === "user" ? "environment" : "user";
      
      // Получаем новый видео поток
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 },
          facingMode: newCamera,
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (newVideoTrack && currentVideoTrack) {
        // Останавливаем старый трек
        currentVideoTrack.stop();
        
        // Заменяем трек в локальном потоке
        localStream.removeTrack(currentVideoTrack);
        localStream.addTrack(newVideoTrack);
        currentVideoTrack = newVideoTrack;
        currentCamera = newCamera;

        // Обновляем локальное видео
        if (localVideo) {
          localVideo.srcObject = localStream;
        }
        
        // Обновляем клон в сетке
        const localVideoInGrid = document.getElementById("localVideoInGrid");
        if (localVideoInGrid) {
          localVideoInGrid.srcObject = localStream;
        }

        // Обновляем все peer connections
        await updateAllPeerConnections();
        
        updateSwitchCameraButton();
        showSystemMessage(`✅ Камера переключена на ${currentCamera === "user" ? "фронтальную" : "заднюю"}`);
        
        // Останавливаем временный поток
        newStream.getTracks().forEach(track => {
          if (track !== newVideoTrack) {
            track.stop();
          }
        });
      }
    } catch (error) {
      console.error("❌ Error switching camera:", error);
      showSystemMessage("❌ Ошибка переключения камеры");
    }
  }

  // Функция для обновления всех peer connections с новым потоком
  async function updateAllPeerConnections() {
    if (!currentVideoTrack) {
      console.warn("⚠️ No current video track to update");
      return;
    }

    const updatePromises = [];

    peerConnections.forEach((pc, sessionId) => {
      if (pc.connectionState === "closed" || pc.signalingState === "closed") {
        console.log(`⚠️ Skipping closed connection ${sessionId}`);
        return;
      }

      const videoSender = pc.getSenders().find(sender => 
        sender.track && sender.track.kind === "video"
      );

      if (videoSender) {
        updatePromises.push(
          videoSender.replaceTrack(currentVideoTrack)
            .then(() => {
              console.log(`✅ Video track replaced for ${sessionId}`);
            })
            .catch((error) => {
              console.error(`❌ Failed to replace track for ${sessionId}:`, error);
              // При ошибке замены трека пересоздаем соединение
              recreateConnection(sessionId);
            })
        );
      } else {
        // Если нет видео sender'а, пересоздаем соединение
        console.log(`🔄 No video sender found for ${sessionId}, recreating connection`);
        recreateConnection(sessionId);
      }
    });

    try {
      await Promise.allSettled(updatePromises);
      console.log(`✅ Updated ${updatePromises.length} peer connections`);
    } catch (error) {
      console.error("❌ Error updating peer connections:", error);
    }
  }

  // Улучшенная функция для пересоздания проблемного соединения
  async function recreateConnection(sessionId) {
    try {
      console.log(`🔄 Recreating connection for ${sessionId}`);
      
      // Проверяем, что пользователь все еще в комнате
      if (!currentRoomId || !roomUsers.has(sessionId) || !isInCall) {
        console.log(`⚠️ User ${sessionId} no longer in room or call ended`);
        removeVideoElement(sessionId);
        return;
      }
      
      // Закрываем старое соединение
      if (peerConnections.has(sessionId)) {
        const oldPc = peerConnections.get(sessionId);
        try {
          if (oldPc.signalingState !== "closed") {
            oldPc.close();
          }
        } catch (closeError) {
          console.warn(`⚠️ Error closing old connection:`, closeError);
        }
        peerConnections.delete(sessionId);
      }
      
      // Удаляем видео элемент
      removeVideoElement(sessionId);
      
      // Создаем новое соединение с задержкой
      setTimeout(async () => {
        try {
          if (currentRoomId && roomUsers.has(sessionId) && isInCall) {
            console.log(`🔄 Creating new offer for ${sessionId}`);
            await createOffer(sessionId);
            console.log(`✅ New connection initiated for ${sessionId}`);
          }
        } catch (createError) {
          console.error(`❌ Failed to create new connection for ${sessionId}:`, createError);
          // Пробуем еще раз через больший интервал
          setTimeout(() => {
            if (currentRoomId && roomUsers.has(sessionId) && isInCall) {
              createOffer(sessionId).catch(() => {
                console.error(`❌ Final attempt failed for ${sessionId}`);
              });
            }
          }, 5000);
        }
      }, 1000);
      
    } catch (error) {
      console.error(`❌ Failed to recreate connection for ${sessionId}:`, error);
    }
  }

  // Функция для обновления состояния кнопки переключения камеры
  function updateSwitchCameraButton() {
    if (!switchCameraBtn) {
      console.warn("⚠️ Switch camera button not found");
      return;
    }
    
    console.log("🔄 Updating switch camera button:", {
      availableCameras: availableCameras.length,
      currentCamera: currentCamera,
      isInCall: isInCall,
      hasVideoTrack: !!currentVideoTrack
    });
    
    if (!isInCall || !currentVideoTrack) {
      switchCameraBtn.style.display = "none";
      return;
    }
    
    // Показываем кнопку если есть видео трек
    switchCameraBtn.style.display = "flex";
    
    // Определяем текст и состояние кнопки
    let buttonText, buttonTitle;
    
    if (availableCameras.length <= 1) {
      // Одна камера или неизвестно - пробуем переключать facingMode
      buttonText = "📱 Камера";
      buttonTitle = "Попробовать переключить камеру";
    } else {
      // Несколько камер - полноценное переключение
      const icon = currentCamera === "user" ? "📱" : "🌄";
      buttonText = `${icon} Камера`;
      buttonTitle = `Переключить на ${currentCamera === "user" ? "заднюю" : "фронтальную"} камеру`;
    }

    switchCameraBtn.innerHTML = buttonText;
    switchCameraBtn.title = buttonTitle;
    switchCameraBtn.disabled = false;

    console.log("✅ Switch camera button updated:", {
      display: "flex",
      text: buttonText,
      title: buttonTitle
    });
  }

  function handleCallInvite(message) {
    if (isInCall) {
      sendMessage({ type: "call_rejected", roomId: message.roomId });
      return;
    }
    
    incomingCall = message;
    callerNameEl.textContent = `${message.fromUserName} (${
      message.isGroupCall ? "Групповой звонок" : "Индивидуальный звонок"
    })`;
    incomingCallModal.classList.remove("hidden");

    setTimeout(() => {
      if (
        incomingCallModal &&
        !incomingCallModal.classList.contains("hidden")
      ) {
        rejectCall();
      }
    }, 30000);
  }

  function handleCallStarted(message) {
    console.log("📞 Call started received:", message);

    currentRoomId = message.roomId;
    isInCall = true;
    isCallInitiator = true;

    initializeLocalStream()
      .then(() => {
        showVideoCallUI();
        setTimeout(() => {
          updateRoomUsers();
        }, 1000);
      })
      .catch((e) => {
        console.error("Error initializing local stream for caller:", e);
        showSystemMessage(
          "⚠️ Нет доступа к камере/микрофону. Продолжаем без видео."
        );
        showVideoCallUI();
      });

    showSystemMessage(`📞 Звонок начат с ${message.targetUserName}`);
  }

  function handleRoomCreated(message) {
    currentRoomId = message.roomId;
    isInCall = true;
    showVideoCallUI();
    showSystemMessage(message.message || "✅ Комната создана");

    if (!localStream) {
      initializeLocalStream().catch((error) => {
        console.error("❌ Failed to initialize local stream:", error);
        showSystemMessage(
          "⚠️ Звонок создан, но нет доступа к камере/микрофону"
        );
      });
    }

    setTimeout(() => {
      updateRoomUsers();
    }, 1000);
  }

  async function acceptCall() {
    if (!incomingCall) return;

    try {
      showSystemMessage("🎥 Запрашиваем доступ к камере и микрофону...");
      await initializeLocalStream();
      currentRoomId = incomingCall.roomId;
      isInCall = true;
      isCallInitiator = false;

      sendMessage({ type: "join_room", roomId: incomingCall.roomId });
      hideIncomingCallModal();
      showVideoCallUI();
      showSystemMessage("✅ Вы присоединились к звонку");

      setTimeout(() => {
        updateRoomUsers();
      }, 1000);
    } catch (error) {
      console.error("Error accepting call:", error);
      showSystemMessage("❌ Ошибка присоединения к звонку");
      hideIncomingCallModal();
    }
  }

  function rejectCall() {
    if (incomingCall) {
      sendMessage({ type: "call_rejected", roomId: incomingCall.roomId });
      hideIncomingCallModal();
      showSystemMessage("❌ Вы отклонили звонок");
    }
  }

  function hideIncomingCallModal() {
    incomingCallModal.classList.add("hidden");
    incomingCall = null;
  }

  function handleCallRejected(message) {
    showSystemMessage(
      `❌ ${message.userName || "Пользователь"} отклонил ваш звонок`
    );
    endCall();
  }

  function handleCallEnded(message) {
    showSystemMessage(
      `📞 ${
        message.endedBy
          ? `Звонок завершен пользователем ${message.endedBy}`
          : "Звонок завершен"
      }`
    );
    endCall();
  }

  function handleUserLeftCall(message) {
    console.log("👋 User left call (from server):", message);
    showSystemMessage(`👋 Пользователь покинул звонок`);
    
    setTimeout(() => {
      updateRoomUsers();
    }, 500);
  }

  // UI функции для видеозвонка (дополнительные)
  function showVideoCallUIBasic() {
    if (!videoCallContainer) {
      console.error("❌ Video call container not found!");
      return;
    }
    videoCallContainer.classList.remove("hidden");
  }

  function hideVideoCallUIBasic() {
    if (videoCallContainer) {
      videoCallContainer.classList.add("hidden");
    }
  }

  // WebRTC Peer Connection с улучшенными настройками
  async function createPeerConnection(targetSessionId) {
    console.log(`🔗 Creating peer connection for: ${targetSessionId}`);

    try {
      // Конфигурация с фолбэком для международных соединений
      let config;
      
      // Пробуем разные конфигурации в зависимости от попытки
      const attempts = (peerConnections.get(targetSessionId)?.connectionAttempts || 0);
      
      if (attempts === 0) {
        // Первая попытка - обычная конфигурация
        config = {
          ...rtcConfig,
          sdpSemantics: 'unified-plan'
        };
      } else if (attempts === 1) {
        // Вторая попытка - только TURN
        config = {
          ...rtcConfigRelay,
          sdpSemantics: 'unified-plan'
        };
      } else {
        // Третья попытка - только TURN серверы
        config = {
          ...rtcConfigTurnOnly,
          sdpSemantics: 'unified-plan'
        };
      }
      
      const pc = new RTCPeerConnection(config);
      
      // Инициализируем массив для ожидающих ICE кандидатов
      pc.pendingIceCandidates = [];
      pc.isRemoteDescriptionSet = false;
      pc.connectionAttempts = 0;
      pc.maxConnectionAttempts = 5;

      // Добавляем локальные треки если они есть
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            const sender = pc.addTrack(track, localStream);
            console.log(`✅ Added ${track.kind} track to peer connection`);
            
            // Сохраняем ссылку на sender для видео трека
            if (track.kind === 'video') {
              pc.videoSender = sender;
            }
          } catch (error) {
            console.error(`❌ Error adding ${track.kind} track:`, error);
          }
        });
      }
      
      // Обработчик получения удаленных потоков
      pc.ontrack = (event) => {
        console.log(`📹 Received ${event.track.kind} track from ${targetSessionId}`);
        
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log(`📹 Stream received:`, {
            id: stream.id,
            active: stream.active,
            tracks: stream.getTracks().length,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length
          });
          
          // Показываем удаленное видео с небольшой задержкой
          setTimeout(() => {
            if (isInCall && currentRoomId) {
              showRemoteVideo(targetSessionId, stream);
            }
          }, 200);
        } else {
          console.warn(`⚠️ No streams in ontrack event for ${targetSessionId}`);
        }
      };

      // Обработчик ICE кандидатов
      pc.onicecandidate = (event) => {
        if (event.candidate && currentRoomId) {
          console.log(`📡 Sending ICE candidate for ${targetSessionId}`);
          
          sendMessage({
            type: "webrtc_ice_candidate",
            roomId: currentRoomId,
            targetSessionId: targetSessionId,
            candidate: event.candidate,
          });
        } else if (!event.candidate) {
          console.log(`✅ ICE gathering complete for ${targetSessionId}`);
        }
      };



      // Обработчик состояния ICE соединения
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log(`🧊 ICE state for ${targetSessionId}: ${iceState}`);
        
        switch (iceState) {
          case "connected":
          case "completed":
            console.log(`✅ ICE connected to ${targetSessionId}`);
            pc.connectionAttempts = 0;
            updateConnectionIndicators();
            break;
          case "checking":
            console.log(`🔄 ICE checking for ${targetSessionId}`);
            break;
          case "failed":
            console.log(`❌ ICE failed for ${targetSessionId}`);
            setTimeout(() => {
              if (pc.iceConnectionState === 'failed' && isInCall) {
                recreateConnection(targetSessionId);
              }
            }, 5000);
            break;
          case "disconnected":
            console.log(`⚠️ ICE disconnected for ${targetSessionId}`);
            setTimeout(() => {
              if (pc.iceConnectionState === 'disconnected' && isInCall) {
                recreateConnection(targetSessionId);
              }
            }, 10000);
            break;
          case "closed":
            console.log(`🔒 ICE closed for ${targetSessionId}`);
            break;
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`🔄 Connection state changed for ${targetSessionId}:`, state);

        // Обновляем индикатор состояния
        updateConnectionIndicators();

        switch (state) {
          case "connected":
            console.log(`✅ Connected to ${targetSessionId}`);
            pc.connectionAttempts = 0;
            const userName = roomUsers.get(targetSessionId)?.userName || 'участнику';
            showSystemMessage(`✅ Подключено к ${userName}`);
            break;
          case "connecting":
            console.log(`🔄 Connecting to ${targetSessionId}`);
            break;
          case "disconnected":
            console.log(`⚠️ Disconnected from ${targetSessionId}`);
            break;
          case "failed":
            console.log(`❌ Connection failed to ${targetSessionId}`);
            break;
          case "closed":
            console.log(`🔒 Connection closed to ${targetSessionId}`);
            removeVideoElement(targetSessionId);
            break;
        }
      };



      // Обработчик signaling состояния
      pc.onsignalingstatechange = () => {
        console.log(`🔄 Signaling state for ${targetSessionId}: ${pc.signalingState}`);
      };

      peerConnections.set(targetSessionId, pc);
      console.log(`✅ PeerConnection created for ${targetSessionId}`);
      return pc;
    } catch (error) {
      console.error(`❌ Error creating peer connection for ${targetSessionId}:`, error);
      throw error;
    }
  }

  // Обработка ошибок соединения
  function handleConnectionFailure(sessionId) {
    console.log(`❌ Connection failed for ${sessionId}`);
    
    const pc = peerConnections.get(sessionId);
    if (pc) {
      if (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected') {
        console.log(`⚠️ False alarm - connection is working for ${sessionId}`);
        return;
      }
      
      try {
        pc.close();
      } catch (error) {
        console.warn(`⚠️ Error closing peer connection:`, error);
      }
      peerConnections.delete(sessionId);
    }
    
    removeVideoElement(sessionId);
    updateConnectionIndicators();
  }

  // Перезапуск ICE соединения
  async function restartIce(targetSessionId) {
    const pc = peerConnections.get(targetSessionId);
    if (!pc || pc.connectionState === "closed" || pc.signalingState === "closed") {
      console.log(`⚠️ Cannot restart ICE - connection closed or invalid state`);
      return;
    }

    // Проверяем, не слишком ли часто мы перезапускаем ICE
    const now = Date.now();
    const lastRestart = lastIceRestartAt.get(targetSessionId) || 0;
    if (now - lastRestart < 5000) {
      console.log(`⚠️ ICE restart too frequent for ${targetSessionId}, skipping`);
      return;
    }

    try {
      console.log(`🔄 Restarting ICE for ${targetSessionId}`);
      lastIceRestartAt.set(targetSessionId, now);
      
      // Проверяем состояние signaling перед созданием offer
      if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
        console.log(`⚠️ Cannot restart ICE - signaling state: ${pc.signalingState}`);
        // Пробуем пересоздать соединение
        recreateConnection(targetSessionId);
        return;
      }
      
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId,
        offer,
        iceRestart: true
      });

      console.log(`✅ ICE restart offer sent for ${targetSessionId}`);
    } catch (error) {
      console.error(`❌ Error restarting ICE for ${targetSessionId}:`, error);
      // При ошибке перезапуска ICE пересоздаем соединение
      recreateConnection(targetSessionId);
    }
  }

  async function createOffer(targetSessionId) {
    return createOfferWithConfig(targetSessionId);
  }
  
  async function createOfferWithConfig(targetSessionId) {
    // Проверяем, не создается ли уже соединение
    if (offerInProgress.has(targetSessionId)) {
      console.log(`⚠️ Offer already in progress for ${targetSessionId}`);
      return;
    }

    // Если соединение уже существует и работает, не создаем новое
    const existingPc = peerConnections.get(targetSessionId);
    if (existingPc && (existingPc.connectionState === "connected" || existingPc.connectionState === "connecting")) {
      console.log(`⚠️ Connection already exists for ${targetSessionId}:`, existingPc.connectionState);
      return;
    }

    try {
      offerInProgress.add(targetSessionId);
      console.log(`📤 Creating offer for ${targetSessionId}`);
      
      // Закрываем старое соединение если оно есть
      if (existingPc) {
        try {
          existingPc.close();
        } catch (closeError) {
          console.warn(`⚠️ Error closing existing connection:`, closeError);
        }
        peerConnections.delete(targetSessionId);
      }
      
      const pc = await createPeerConnection(targetSessionId);
      
      // Создаем offer с оптимальными настройками
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: true
      };
      
      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);

      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId,
        offer,
      });
      
      console.log(`✅ Offer created and sent for ${targetSessionId}`);
    } catch (error) {
      console.error(`❌ Error creating offer for ${targetSessionId}:`, error);
      // Удаляем проблемное соединение
      if (peerConnections.has(targetSessionId)) {
        const pc = peerConnections.get(targetSessionId);
        try {
          pc.close();
        } catch (closeError) {
          console.warn(`⚠️ Error closing failed connection:`, closeError);
        }
        peerConnections.delete(targetSessionId);
      }
    } finally {
      offerInProgress.delete(targetSessionId);
    }
  }



  async function handleWebRTCOffer(message) {
    try {
      console.log(`📥 Received WebRTC offer from: ${message.fromSessionId}`);
      
      // Проверяем, что мы все еще в звонке
      if (!isInCall || !currentRoomId) {
        console.log(`⚠️ Ignoring offer - not in call`);
        return;
      }
      
      // Если уже есть соединение, проверяем его состояние
      if (peerConnections.has(message.fromSessionId)) {
        const existingPc = peerConnections.get(message.fromSessionId);
        
        // Если соединение работает и это не ICE restart, игнорируем
        if (existingPc.connectionState === "connected" && !message.iceRestart) {
          console.log(`⚠️ Ignoring offer - connection already established`);
          return;
        }
        
        // Закрываем старое соединение
        try {
          existingPc.close();
        } catch (closeError) {
          console.warn(`⚠️ Error closing existing connection:`, closeError);
        }
        peerConnections.delete(message.fromSessionId);
      }
      
      const pc = await createPeerConnection(message.fromSessionId);
      
      // Устанавливаем remote description
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      pc.isRemoteDescriptionSet = true;
      
      // Создаем answer
      const answerOptions = {
        voiceActivityDetection: true
      };
      
      const answer = await pc.createAnswer(answerOptions);
      await pc.setLocalDescription(answer);

      sendMessage({
        type: "webrtc_answer",
        roomId: message.roomId,
        targetSessionId: message.fromSessionId,
        answer: answer,
      });
      
      // Обрабатываем ожидающие ICE кандидаты
      if (pc.pendingIceCandidates?.length > 0) {
        console.log(`📦 Processing ${pc.pendingIceCandidates.length} pending ICE candidates`);
        
        for (const candidateData of pc.pendingIceCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (iceError) {
            console.warn(`⚠️ Failed to add pending ICE candidate:`, iceError);
          }
        }
        pc.pendingIceCandidates = [];
      }
      
      console.log(`✅ WebRTC answer sent to ${message.fromSessionId}`);
    } catch (error) {
      console.error(`❌ Error handling WebRTC offer from ${message.fromSessionId}:`, error);
      
      // При ошибке удаляем проблемное соединение
      if (peerConnections.has(message.fromSessionId)) {
        const pc = peerConnections.get(message.fromSessionId);
        try {
          pc.close();
        } catch (closeError) {
          console.warn(`⚠️ Error closing failed connection:`, closeError);
        }
        peerConnections.delete(message.fromSessionId);
      }
    }
  }

  async function handleWebRTCAnswer(message) {
    try {
      console.log(`📥 Received WebRTC answer from: ${message.fromSessionId}`);

      const pc = peerConnections.get(message.fromSessionId);
      if (!pc) {
        console.warn(`❌ PeerConnection not found for ${message.fromSessionId}`);
        return;
      }

      if (pc.signalingState !== "have-local-offer") {
        console.warn(`⚠️ Unexpected signaling state: ${pc.signalingState}`);
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
      pc.isRemoteDescriptionSet = true;
      console.log(`✅ Remote answer set for ${message.fromSessionId}`);

      // Обрабатываем ожидающие ICE кандидаты
      if (pc.pendingIceCandidates?.length > 0) {
        console.log(`📦 Processing ${pc.pendingIceCandidates.length} pending ICE candidates`);
        
        for (const candidateData of pc.pendingIceCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidateData));
          } catch (iceError) {
            console.warn(`⚠️ Failed to add pending ICE candidate:`, iceError);
          }
        }
        pc.pendingIceCandidates = [];
      }
    } catch (error) {
      console.error(`❌ Error handling WebRTC answer:`, error);
    }
  }

  async function handleICECandidate(message) {
    try {
      const pc = peerConnections.get(message.fromSessionId);
      if (!pc) {
        console.warn(`❌ PeerConnection not found for ICE candidate: ${message.fromSessionId}`);
        return;
      }

      if (pc.signalingState === "closed") {
        console.warn(`⚠️ Ignoring ICE candidate for closed connection`);
        return;
      }

      const candidate = new RTCIceCandidate(message.candidate);

      // Если remote description установлен, добавляем кандидата сразу
      if (pc.isRemoteDescriptionSet && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(candidate);
          console.log(`✅ ICE candidate added for ${message.fromSessionId}`);
        } catch (addError) {
          console.warn(`⚠️ Failed to add ICE candidate:`, addError.message);
        }
      } else {
        // Сохраняем кандидата для последующей обработки
        if (!pc.pendingIceCandidates) {
          pc.pendingIceCandidates = [];
        }
        pc.pendingIceCandidates.push(message.candidate);
        console.log(`📦 Queued ICE candidate (${pc.pendingIceCandidates.length} total)`);
      }
    } catch (error) {
      console.error(`❌ Error handling ICE candidate:`, error);
    }
  }

  function handleUserJoined(message) {
    console.log(`👤 User ${message.userName} joined the call`);

    if (!roomUsers.has(message.sessionId)) {
      roomUsers.set(message.sessionId, {
        userId: message.userId,
        userName: message.userName,
        sessionId: message.sessionId,
      });

      updateParticipantsCount(roomUsers.size);

      if (isInCall && message.sessionId !== mySessionId) {
        createOffer(message.sessionId);
      }
    }
  }

  function handleRoomUsers(message) {
    console.log("👥 Room users received:", message.users);

    // Сохраняем старый список для сравнения
    const prevUsers = new Map(roomUsers);

    roomUsers.clear();
    message.users.forEach((user) => {
      roomUsers.set(user.sessionId, user);
    });

    updateParticipantsCount(message.users.length);

    // Фильтруем других пользователей (не себя)
    const otherUsers = message.users.filter(
      (user) => user.sessionId !== mySessionId
    );

    console.log(`🎯 Processing ${otherUsers.length} other users, my session: ${mySessionId}`);

    // Удаляем соединения и видео элементы пользователей, которых больше нет
    peerConnections.forEach((pc, sessionId) => {
      if (!roomUsers.has(sessionId) && sessionId !== mySessionId) {
        console.log(`🗑️ Removing connection to user who left: ${sessionId}`);
        try {
          pc.close();
        } catch (error) {
          console.warn(`⚠️ Error closing connection:`, error);
        }
        peerConnections.delete(sessionId);
        removeVideoElement(sessionId);
      }
    });

    // Создаем офферы к пользователям
    otherUsers.forEach((user, index) => {
      const wasPresent = prevUsers.has(user.sessionId);
      const hasConnection = peerConnections.has(user.sessionId);
      const pc = peerConnections.get(user.sessionId);
      const isConnected = pc && (pc.connectionState === "connected" || pc.connectionState === "connecting");
      
      console.log(`🔍 User ${user.sessionId} (${user.userName}): wasPresent=${wasPresent}, hasConnection=${hasConnection}, isConnected=${isConnected}`);
      
      // Создаем соединение если его нет или оно не работает
      if (!isConnected) {
        console.log(`📤 Creating offer for: ${user.sessionId} (${user.userName})`);
        
        // Разносим по времени чтобы избежать коллизий
        const delay = (index + 1) * 300 + Math.random() * 200;
        setTimeout(() => {
          if (currentRoomId && roomUsers.has(user.sessionId)) {
            createOffer(user.sessionId).catch(error => {
              console.error(`❌ Failed to create offer for ${user.sessionId}:`, error);
            });
          }
        }, delay);
      }
    });
  }

  function handleUserLeft(message) {
    console.log(`👤 User ${message.userName} left the call`);

    roomUsers.delete(message.sessionId);

    if (peerConnections.has(message.sessionId)) {
      peerConnections.get(message.sessionId).close();
      peerConnections.delete(message.sessionId);
    }

    removeVideoElement(message.sessionId);
    updateParticipantsCount(roomUsers.size);
    showSystemMessage(`👤 ${message.userName} покинул звонок`);
  }

  function showRemoteVideo(sessionId, remoteStream) {
    console.log(`🎥 Showing remote video for: ${sessionId}`, remoteStream);

    // Не создаем видео для собственной сессии
    if (sessionId === mySessionId) {
      console.log(`⚠️ Skipping remote video for own session: ${sessionId}`);
      return;
    }

    // Обязательно нужен поток
    if (!remoteStream) {
      console.log(`⚠️ No stream provided for ${sessionId}`);
      return;
    }

    const remoteVideoId = `remoteVideo_${sessionId}`;
    const videoContainerId = `videoContainer_${sessionId}`;

    let videoContainer = document.getElementById(videoContainerId);
    let remoteVideo = document.getElementById(remoteVideoId);

    // Если контейнер не существует, создаем его
    if (!videoContainer) {
      console.log(`🆕 Creating new video container for: ${sessionId}`);

      videoContainer = document.createElement("div");
      videoContainer.className = "video-container";
      videoContainer.id = videoContainerId;
      videoContainer.style.position = "relative";
      videoContainer.style.backgroundColor = "var(--bg-secondary)";
      videoContainer.style.borderRadius = "12px";
      videoContainer.style.overflow = "hidden";
      videoContainer.style.minHeight = "200px";

      remoteVideo = document.createElement("video");
      remoteVideo.id = remoteVideoId;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.muted = false;
      remoteVideo.style.width = "100%";
      remoteVideo.style.height = "100%";
      remoteVideo.style.objectFit = "cover";
      remoteVideo.style.minHeight = "200px";
      remoteVideo.setAttribute("playsinline", "");
      remoteVideo.setAttribute("autoplay", "");
      remoteVideo.controls = false;

      const videoLabel = document.createElement("div");
      videoLabel.className = "video-label";
      videoLabel.textContent = roomUsers.get(sessionId)?.userName || "Участник";
      videoLabel.style.position = "absolute";
      videoLabel.style.top = "8px";
      videoLabel.style.left = "8px";
      videoLabel.style.background = "rgba(0, 0, 0, 0.7)";
      videoLabel.style.color = "white";
      videoLabel.style.padding = "4px 8px";
      videoLabel.style.borderRadius = "6px";
      videoLabel.style.fontSize = "12px";
      videoLabel.style.zIndex = "1";

      videoContainer.appendChild(remoteVideo);
      videoContainer.appendChild(videoLabel);

      const videoGrid = document.querySelector(".video-grid");
      if (videoGrid) {
        videoGrid.appendChild(videoContainer);
        console.log(`✅ Video container added to grid for: ${sessionId}`);
      } else {
        console.error("❌ Video grid not found!");
      }
    }

    // Устанавливаем поток в видео элемент
    if (remoteVideo) {
      console.log(`🎬 Setting remote stream for: ${sessionId}`);
      console.log(`🎬 Stream tracks:`, remoteStream.getTracks().map(t => `${t.kind}: ${t.enabled}`));

      remoteVideo.srcObject = remoteStream;

      // Улучшенная обработка автопроигрывания с соблюдением политики браузера
      setTimeout(() => {
        // Сначала пробуем автоматический запуск
        const playPromise = remoteVideo.play();
        
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((e) => {
            console.warn(`⚠️ Auto-play prevented for ${sessionId}:`, e);
            
            // Удаляем предыдущие кнопки запуска
            const existingButton = videoContainer.querySelector('.play-video-btn');
            if (existingButton) {
              existingButton.remove();
            }
            
            // Добавляем улучшенную кнопку для ручного запуска
            const playButton = document.createElement('button');
            playButton.className = 'play-video-btn';
            playButton.innerHTML = '▶️ Нажмите для просмотра видео';
            playButton.style.cssText = `
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              z-index: 10;
              padding: 12px 20px;
              background: var(--primary-blue);
              color: white;
              border: none;
              border-radius: 12px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
              transition: all 0.2s;
            `;
            
            playButton.onmouseover = () => {
              playButton.style.background = '#1d4ed8';
              playButton.style.transform = 'translate(-50%, -50%) scale(1.05)';
            };
            
            playButton.onmouseout = () => {
              playButton.style.background = 'var(--primary-blue)';
              playButton.style.transform = 'translate(-50%, -50%) scale(1)';
            };
            
            playButton.onclick = async () => {
              try {
                // Воспроизводим звук для разблокировки автопроигрывания
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.1);
                
                // Запускаем видео после разблокировки аудио
                setTimeout(async () => {
                  try {
                    await remoteVideo.play();
                    playButton.remove();
                    console.log(`✅ Video started for ${sessionId}`);
                  } catch (playError) {
                    console.error(`❌ Failed to start video for ${sessionId}:`, playError);
                    playButton.textContent = '❌ Ошибка запуска';
                    playButton.style.background = 'var(--primary-red)';
                    setTimeout(() => playButton.remove(), 2000);
                  }
                }, 100);
                
              } catch (playError) {
                console.error(`❌ Failed to start video for ${sessionId}:`, playError);
                playButton.textContent = '❌ Ошибка запуска';
                playButton.style.background = 'var(--primary-red)';
                setTimeout(() => playButton.remove(), 2000);
              }
            };
            
            videoContainer.appendChild(playButton);
          });
        }
      }, 200);

      // Добавляем обработчики для отладки
      remoteVideo.onloadedmetadata = () => {
        console.log(`✅ Remote video metadata loaded for: ${sessionId}`);
      };

      remoteVideo.oncanplay = () => {
        console.log(`🎬 Remote video can play for: ${sessionId}`);
      };

      remoteVideo.onerror = (e) => {
        console.error(`❌ Remote video error for ${sessionId}:`, e);
      };
    }

    updateVideoGridLayout();
  }

  function removeVideoElement(sessionId) {
    const videoContainer = document.getElementById(
      `videoContainer_${sessionId}`
    );
    if (videoContainer) {
      videoContainer.remove();
      updateVideoGridLayout();
    }
  }

  function updateVideoGridLayout() {
    const videoGrid = document.querySelector(".video-grid");
    if (!videoGrid) {
      console.error("❌ Video grid not found!");
      return;
    }

    const videoContainers = videoGrid.querySelectorAll(".video-container");
    const count = videoContainers.length;

    console.log(`🎬 Updating video grid layout: ${count} containers`);

    // Адапт��вная сетка: всегда укладывать превью в видимую сетку
    let columns, minHeight;
    
    if (count === 1) {
      columns = "1fr";
      minHeight = "300px";
    } else if (count === 2) {
      columns = "repeat(2, 1fr)";
      minHeight = "250px";
    } else if (count <= 4) {
      columns = "repeat(2, 1fr)";
      minHeight = "200px";
    } else if (count <= 6) {
      columns = "repeat(3, 1fr)";
      minHeight = "180px";
    } else if (count <= 9) {
      columns = "repeat(3, 1fr)";
      minHeight = "160px";
    } else if (count <= 12) {
      columns = "repeat(4, 1fr)";
      minHeight = "140px";
    } else if (count <= 16) {
      columns = "repeat(4, 1fr)";
      minHeight = "120px";
    } else {
      columns = "repeat(5, 1fr)";
      minHeight = "100px";
    }

    videoGrid.style.gridTemplateColumns = columns;
    videoGrid.style.gridAutoRows = `minmax(${minHeight}, 1fr)`;
    videoGrid.style.gap = "8px";
    videoGrid.style.overflow = "auto";
    videoGrid.style.maxHeight = "calc(100vh - 200px)";

    videoContainers.forEach((container) => {
      container.style.minHeight = minHeight;
      container.style.borderRadius = "8px";
    });
  }

  function updateRoomUsers() {
    if (currentRoomId) {
      sendMessage({
        type: "get_room_users",
        roomId: currentRoomId,
      });
    }
  }

  function updateCallStatus(state) {
    if (callStatusEl) {
      const statusMap = {
        connected: "✅ Подключено",
        connecting: "🔄 Подключение...",
        disconnected: "⚠️ Соединение прервано",
      };
      callStatusEl.textContent = statusMap[state] || state;
    }
  }

  function updateParticipantsCount(count) {
    participantsCount = count;
    if (participantsCountEl) {
      participantsCountEl.textContent = `Участников: ${count}`;
    }
  }

  function showVideoCallUI() {
    if (!videoCallContainer) {
      console.error("❌ Video call container not found!");
      return;
    }
    
    videoCallContainer.classList.remove("hidden");
    updateCallButtons();

    // Очищаем сетку и добавляем только локальное видео
    setTimeout(() => {
      clearVideoGrid();
      addLocalVideoToGrid();
      updateSwitchCameraButton();
      console.log("✅ Video call UI shown");
    }, 500);
  }

  function clearVideoGrid() {
    const videoGrid = document.querySelector(".video-grid");
    if (!videoGrid) return;
    
    // Удаляем все видео контейнеры
    const containers = videoGrid.querySelectorAll(".video-container");
    containers.forEach(container => container.remove());
    console.log("🧹 Video grid cleared");
  }

  function addLocalVideoToGrid() {
    const videoGrid = document.querySelector(".video-grid");
    if (!videoGrid) return;

    // Проверяем, есть ли уже локальное видео в сетке
    if (document.getElementById("localVideoContainer")) {
      console.log("⚠️ Local video already in grid");
      return;
    }

    // Создаем контейнер для локального видео
    const localContainer = document.createElement("div");
    localContainer.className = "video-container";
    localContainer.id = "localVideoContainer";
    localContainer.style.position = "relative";
    localContainer.style.backgroundColor = "var(--bg-secondary)";
    localContainer.style.borderRadius = "12px";
    localContainer.style.overflow = "hidden";
    localContainer.style.minHeight = "200px";

    // Клонируем локальное видео
    const localVideoClone = document.createElement("video");
    localVideoClone.id = "localVideoInGrid";
    localVideoClone.autoplay = true;
    localVideoClone.playsInline = true;
    localVideoClone.muted = true;
    localVideoClone.style.width = "100%";
    localVideoClone.style.height = "100%";
    localVideoClone.style.objectFit = "cover";
    localVideoClone.style.minHeight = "200px";
    localVideoClone.style.transform = "scaleX(-1)"; // Зеркалим для себя

    // Копируем поток из основного локального видео
    if (localVideo && localVideo.srcObject) {
      localVideoClone.srcObject = localVideo.srcObject;
    }

    const videoLabel = document.createElement("div");
    videoLabel.className = "video-label";
    videoLabel.textContent = "Вы";
    videoLabel.style.position = "absolute";
    videoLabel.style.top = "8px";
    videoLabel.style.left = "8px";
    videoLabel.style.background = "rgba(0, 0, 0, 0.7)";
    videoLabel.style.color = "white";
    videoLabel.style.padding = "4px 8px";
    videoLabel.style.borderRadius = "6px";
    videoLabel.style.fontSize = "12px";
    videoLabel.style.zIndex = "1";

    localContainer.appendChild(localVideoClone);
    localContainer.appendChild(videoLabel);
    videoGrid.appendChild(localContainer);

    updateVideoGridLayout();
    console.log("✅ Local video added to grid");
  }

  function hideVideoCallUI() {
    videoCallContainer.classList.add("hidden");
    
    // Очищаем всю видео сетку
    clearVideoGrid();
  }

  function updateCallButtons() {
    if (startCallBtn) startCallBtn.disabled = isInCall;
    if (endCallBtn) endCallBtn.disabled = !isInCall;
  }

  function toggleVideo() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        toggleVideoBtn.textContent = videoTrack.enabled ? "🎥" : "❌🎥";
        showSystemMessage(
          videoTrack.enabled ? "✅ Камера включена" : "❌ Камера выключена"
        );
      }
    }
  }

  function toggleAudio() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        toggleAudioBtn.textContent = audioTrack.enabled ? "🎤" : "❌🎤";
        showSystemMessage(
          audioTrack.enabled ? "✅ Микрофон включен" : "❌ Микрофон выключен"
        );
      }
    }
  }

  function endCall() {
    console.log("📞 Ending call...");

    try {
      // Отправляем сообщения о завершении звонка
      if (currentRoomId && ws && ws.readyState === WebSocket.OPEN) {
        sendMessage({ type: "leave_room", roomId: currentRoomId });
        if (isCallInitiator) {
          sendMessage({ type: "end_call", roomId: currentRoomId });
        }
      }

      // Закрываем все peer connections
      peerConnections.forEach((pc, sessionId) => {
        try {
          if (pc.signalingState !== "closed") {
            pc.close();
          }
          removeVideoElement(sessionId);
        } catch (error) {
          console.warn(`⚠️ Error closing connection for ${sessionId}:`, error);
        }
      });
      peerConnections.clear();

      // Очищаем вспомогательные структуры
      offerInProgress.clear();
      lastIceRestartAt.clear();
      iceRestartTimers.forEach(timer => clearTimeout(timer));
      iceRestartTimers.clear();

      // Останавливаем локальный поток
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          try {
            track.stop();
            console.log(`🔇 Stopped ${track.kind} track`);
          } catch (error) {
            console.warn(`⚠️ Error stopping ${track.kind} track:`, error);
          }
        });
        localStream = null;
      }

      // Очищаем видео элементы
      if (localVideo) {
        localVideo.srcObject = null;
      }
      
      const localVideoInGrid = document.getElementById("localVideoInGrid");
      if (localVideoInGrid) {
        localVideoInGrid.srcObject = null;
      }

      // Сбрасываем состояние
      currentRoomId = null;
      isInCall = false;
      isCallInitiator = false;
      roomUsers.clear();
      incomingCall = null;
      currentCamera = "user";
      availableCameras = [];
      currentVideoTrack = null;

      // Скрываем UI
      hideVideoCallUI();
      hideIncomingCallModal();
      updateCallButtons();

      if (switchCameraBtn) {
        switchCameraBtn.style.display = "none";
      }

      console.log("✅ Call ended successfully");
      showSystemMessage("📞 Звонок завершен");
    } catch (error) {
      console.error("❌ Error ending call:", error);
      showSystemMessage("⚠️ Звонок завершен с ошибками");
    } finally {
      // Принудительная очистка состояния
      isInCall = false;
      currentRoomId = null;
    }
  }

  // Глобальные функции для игр и опросов
  window.votePoll = function(pollId, optionIndex) {
    // Проверяем, не голосовал ли уже пользователь
    const pollOptions = document.getElementById(`poll_options_${pollId}`);
    if (pollOptions && pollOptions.dataset.voted === 'true') {
      showSystemMessage('❌ Вы уже голосовали в этом опросе');
      return;
    }
    
    sendMessage({
      type: "poll_vote",
      pollId: pollId,
      optionIndex: optionIndex
    });
    
    // Отмечаем, что пользователь проголосовал
    if (pollOptions) {
      pollOptions.dataset.voted = 'true';
      const buttons = pollOptions.querySelectorAll('.poll-option');
      buttons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
      });
    }
  };

  window.joinGame = function(gameId) {
    sendMessage({
      type: "join_game",
      gameId: gameId
    });
  };

  window.addPollOption = function() {
    const optionsDiv = document.getElementById('pollOptions');
    const optionCount = optionsDiv.children.length + 1;
    const input = document.createElement('input');
    input.className = 'poll-option-input';
    input.placeholder = `Вариант ${optionCount}`;
    input.style.cssText = 'width:100%;margin:4px 0;padding:6px';
    optionsDiv.appendChild(input);
  };

  window.createGame = function(gameType) {
    sendMessage({
      type: 'create_game',
      gameType: gameType,
      gameData: {}
    });
    document.querySelector('.modal').remove();
  };

  function showGameInterface(gameData) {
    const modal = document.createElement('div');
    modal.className = 'modal game-modal';
    modal.id = `game_modal_${gameData.gameId}`;
    
    let gameHTML = '';
    switch(gameData.gameType) {
      case 'tic-tac-toe':
        gameHTML = createTicTacToeHTML(gameData);
        break;
      case 'word-chain':
        gameHTML = createWordChainHTML(gameData);
        break;
      case 'quiz':
        gameHTML = createQuizHTML(gameData);
        break;
      case 'riddle':
        gameHTML = createRiddleHTML(gameData);
        break;
      case 'mafia':
        gameHTML = createMafiaHTML(gameData);
        break;
      case 'werewolf':
        gameHTML = createWerewolfHTML(gameData);
        break;
      case 'alias':
        gameHTML = createAliasHTML(gameData);
        break;
      case 'uno':
        gameHTML = createUnoHTML(gameData);
        break;
      case 'blackjack':
        gameHTML = createBlackjackHTML(gameData);
        break;
      default:
        gameHTML = '<div>Неизвестный тип игры</div>';
    }
    
    modal.innerHTML = `
      <div class="modal-content game-content">
        <div class="game-header">
          <h3>🎮 ${gameData.gameType}</h3>
          <button onclick="leaveGame(${gameData.gameId})" class="reject-btn">✕</button>
        </div>
        ${gameHTML}
      </div>
    `;
    
    document.body.appendChild(modal);
  }

  // Инициализация уведомлений при загрузке
  if (window.backgroundNotifications) {
    window.backgroundNotifications.init().then(() => {
      console.log('✅ Система уведомлений инициализирована');
    }).catch(error => {
      console.log('❌ Ошибка инициализации уведомлений:', error);
    });
  }

  function createTicTacToeHTML(gameData) {
    const board = gameData.board || Array(9).fill('');
    return `
      <div class="tic-tac-toe-board">
        ${board.map((cell, i) => 
          `<button class="tic-cell" onclick="makeMove(${gameData.gameId}, ${i})" ${cell ? 'disabled' : ''}>
            ${cell}
          </button>`
        ).join('')}
      </div>
      <div class="game-status">
        Ход: ${gameData.currentPlayer || 'X'} | Вы: ${gameData.playerSymbol || 'X'}
      </div>
    `;
  }

  function createWordChainHTML(gameData) {
    return `
      <div class="word-chain-game">
        <div class="words-list">
          ${(gameData.words || []).map(w => `<div class="word-item">${w}</div>`).join('')}
        </div>
        <input id="wordInput_${gameData.gameId}" placeholder="Введите слово..." maxlength="20">
        <button onclick="submitWord(${gameData.gameId})">Отправить</button>
        <div class="game-status">
          Последняя буква: ${gameData.lastLetter || '-'}
        </div>
      </div>
    `;
  }

  function createQuizHTML(gameData) {
    const q = gameData.currentQuestion;
    if (!q) return '<div>Загрузка вопроса...</div>';
    
    return `
      <div class="quiz-game">
        <div class="question">${q.question}</div>
        <div class="quiz-options">
          ${q.options.map((opt, i) => 
            `<button onclick="answerQuiz(${gameData.gameId}, ${i})">${opt}</button>`
          ).join('')}
        </div>
        <div class="quiz-score">Счет: ${gameData.scores || '{}'}</div>
      </div>
    `;
  }

  window.makeMove = function(gameId, position) {
    sendMessage({ type: 'game_move', gameId, move: { position } });
  };

  window.submitWord = function(gameId) {
    const input = document.getElementById(`wordInput_${gameId}`);
    const word = input.value.trim().toLowerCase();
    if (word) {
      sendMessage({ type: 'game_move', gameId, move: { word } });
      input.value = '';
    }
  };

  window.answerQuiz = function(gameId, answer) {
    sendMessage({ type: 'game_move', gameId, move: { answer } });
  };

  window.leaveGame = function(gameId) {
    sendMessage({ type: 'leave_game', gameId });
    const modal = document.getElementById(`game_modal_${gameId}`);
    if (modal) modal.remove();
  };

  function handleGameMove(data) {
    const modal = document.getElementById(`game_modal_${data.gameId}`);
    if (!modal) return;
    
    // Обновляем интерфейс игры
    const gameContent = modal.querySelector('.game-content');
    let newHTML = '';
    
    switch(data.gameType) {
      case 'tic-tac-toe':
        newHTML = createTicTacToeHTML(data);
        break;
      case 'word-chain':
        newHTML = createWordChainHTML(data);
        break;
      case 'quiz':
        newHTML = createQuizHTML(data);
        break;
      case 'riddle':
        newHTML = createRiddleHTML(data);
        break;
      case 'mafia':
        newHTML = createMafiaHTML(data);
        break;
      case 'alias':
        newHTML = createAliasHTML(data);
        break;
      case 'uno':
        newHTML = createUnoHTML(data);
        break;
      case 'werewolf':
        newHTML = createMafiaHTML(data);
        break;
      default:
        newHTML = '<div>Неизвестный тип игры</div>';
    }
    
    const header = gameContent.querySelector('.game-header').outerHTML;
    gameContent.innerHTML = header + newHTML;
  }

  function handleGameEnd(data) {
    const modal = document.getElementById(`game_modal_${data.gameId}`);
    if (modal) {
      const content = modal.querySelector('.modal-content');
      content.innerHTML = `
        <h3>🎮 Игра завершена!</h3>
        <div class="game-result">${data.result}</div>
        <button onclick="this.parentElement.parentElement.remove()" class="accept-btn">Закрыть</button>
      `;
    }
    showSystemMessage(`🎮 ${data.result}`);
  }

  window.createPoll = function() {
    const question = document.getElementById('pollQuestion').value.trim();
    const optionInputs = document.querySelectorAll('.poll-option-input');
    const options = Array.from(optionInputs)
      .map(input => input.value.trim())
      .filter(option => option.length > 0);
    const duration = parseInt(document.getElementById('pollDuration').value) || null;
    
    if (!question || options.length < 2) {
      alert('Введите вопрос и минимум 2 варианта ответа');
      return;
    }
    
    sendMessage({
      type: 'create_poll',
      question: question,
      options: options,
      duration: duration
    });
    
    document.querySelector('.modal').remove();
  };

  // Функция для создания загадок
  window.createRiddle = function() {
    sendMessage({
      type: 'create_game',
      gameType: 'riddle',
      gameData: {}
    });
    document.querySelector('.modal').remove();
  };

  // Функция для ответа на загадку
  window.answerRiddle = function(gameId) {
    const input = document.getElementById(`riddleInput_${gameId}`);
    const answer = input.value.trim().toLowerCase();
    if (answer) {
      sendMessage({ type: 'game_move', gameId, move: { answer } });
      input.value = '';
    }
  };

  // Новые функции для игр
  window.showVoteDialog = function(gameId) {
    const players = document.querySelectorAll('.player-card.alive');
    const options = Array.from(players).map((p, i) => 
      `<button onclick="votePlayer(${gameId}, ${i})">${p.querySelector('.player-name').textContent}</button>`
    ).join('');
    
    const modal = document.createElement('div');
    modal.className = 'modal vote-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🗳️ Голосование</h3>
        <p>Выберите игрока для исключения:</p>
        <div class="vote-options">${options}</div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.votePlayer = function(gameId, playerIndex) {
    sendMessage({ type: 'game_move', gameId, move: { vote: playerIndex } });
    document.querySelector('.vote-modal').remove();
  };

  window.aliasGuessed = function(gameId) {
    sendMessage({ type: 'game_move', gameId, move: { action: 'guessed' } });
  };

  window.aliasSkip = function(gameId) {
    sendMessage({ type: 'game_move', gameId, move: { action: 'skip' } });
  };

  window.playUnoCard = function(gameId, cardIndex) {
    sendMessage({ type: 'game_move', gameId, move: { playCard: cardIndex } });
  };

  window.drawUnoCard = function(gameId) {
    sendMessage({ type: 'game_move', gameId, move: { action: 'draw' } });
  };

  // Функции для турниров
  function showTournamentMessage(tournament) {
    const el = document.createElement('div');
    el.className = 'tournament-message';
    el.id = `tournament_${tournament.id}`;
    
    el.innerHTML = `
      <div class="tournament-header">
        <strong>🏆 Турнир: ${escapeHtml(tournament.name)}</strong>
        <span class="tournament-status">Набор участников</span>
      </div>
      <div class="tournament-info">
        <div class="tournament-game">🎮 ${tournament.gameType}</div>
        <div class="tournament-players">👥 ${tournament.participants}/${tournament.maxPlayers} игроков</div>
        <div class="tournament-type">🏅 ${tournament.type === 'elimination' ? 'На выбывание' : 'Круговой'}</div>
      </div>
      ${tournament.description ? `<div class="tournament-description">${escapeHtml(tournament.description)}</div>` : ''}
      <div class="tournament-controls">
        <button class="join-tournament-btn" onclick="joinTournament(${tournament.id})">
          🏆 Присоединиться
        </button>
        <span class="tournament-creator">Создатель: ${tournament.creatorName}</span>
      </div>
    `;

    addMessage(el);
  }

  function updateTournamentParticipants(data) {
    const tournamentEl = document.getElementById(`tournament_${data.tournamentId}`);
    if (tournamentEl) {
      const playersEl = tournamentEl.querySelector('.tournament-players');
      if (playersEl) {
        playersEl.textContent = `👥 ${data.participants}/${data.maxPlayers} игроков`;
      }
    }
  }

  function updateTournamentStatus(tournamentId, status) {
    const tournamentEl = document.getElementById(`tournament_${tournamentId}`);
    if (tournamentEl) {
      const statusEl = tournamentEl.querySelector('.tournament-status');
      const joinBtn = tournamentEl.querySelector('.join-tournament-btn');
      
      if (statusEl) {
        statusEl.textContent = status === 'started' ? 'В процессе' : 'Завершен';
      }
      
      if (joinBtn && status === 'started') {
        joinBtn.disabled = true;
        joinBtn.textContent = 'Турнир начался';
      }
    }
  }

  function showTournamentRound(data) {
    const modal = document.createElement('div');
    modal.className = 'modal tournament-round-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🏆 Турнир: ${data.tournamentName}</h3>
        <h4>Раунд ${data.round}</h4>
        <div class="tournament-matches">
          ${data.matches.map(match => `
            <div class="match">
              <span class="player1">${match.player1}</span>
              <span class="vs">VS</span>
              <span class="player2">${match.player2}</span>
              ${match.winner ? `<span class="winner">Победитель: ${match.winner}</span>` : ''}
            </div>
          `).join('')}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="accept-btn">Понятно</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function showTournamentResults(data) {
    const modal = document.createElement('div');
    modal.className = 'modal tournament-results-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🏆 Турнир завершен!</h3>
        <h4>${data.tournamentName}</h4>
        <div class="tournament-podium">
          <div class="winner gold">🥇 1 место: ${data.results[0]?.name || '?'}</div>
          ${data.results[1] ? `<div class="winner silver">🥈 2 место: ${data.results[1].name}</div>` : ''}
          ${data.results[2] ? `<div class="winner bronze">🥉 3 место: ${data.results[2].name}</div>` : ''}
        </div>
        <div class="all-results">
          <h5>Полные результаты:</h5>
          ${data.results.map((player, i) => 
            `<div class="result-item">${i + 1}. ${player.name} - ${player.score || 0} очков</div>`
          ).join('')}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="accept-btn">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Обновленная функция создания HTML для загадок
  function createRiddleHTML(gameData) {
    const riddle = gameData.currentRiddle;
    if (!riddle) return '<div>Загрузка загадки...</div>';
    
    return `
      <div class="riddle-game">
        <div class="riddle-text">${riddle.question}</div>
        <div class="riddle-input-area">
          <input id="riddleInput_${gameData.gameId}" placeholder="Ваш ответ..." maxlength="50">
          <button onclick="answerRiddle(${gameData.gameId})">Ответить</button>
        </div>
        <div class="riddle-hints">
          ${riddle.hints ? riddle.hints.map(hint => `<div class="hint">💡 ${hint}</div>`).join('') : ''}
        </div>
        <div class="riddle-score">Счет: ${JSON.stringify(gameData.scores || {})}</div>
      </div>
    `;
  }

  function createMafiaHTML(gameData) {
    return `
      <div class="mafia-game">
        <div class="game-phase">Фаза: ${gameData.phase || 'Ожидание'} - День ${gameData.day || 1}</div>
        <div class="your-role">Ваша роль: ${gameData.playerRole || 'Неизвестно'}</div>
        <div class="players-list">
          ${(gameData.alive || []).map(playerId => {
            const player = gameData.players.find(p => p.user_id === playerId);
            return `<div class="player-card alive">
              <span class="player-name">${player ? player.username : 'Игрок'}</span>
              <span class="player-status">Жив</span>
            </div>`;
          }).join('')}
        </div>
        <div class="mafia-actions">
          ${gameData.phase === 'day' ? '<button onclick="showVoteDialog(' + gameData.gameId + ')">Голосовать</button>' : ''}
        </div>
      </div>
    `;
  }

  function createWerewolfHTML(gameData) {
    return `
      <div class="werewolf-game">
        <div class="game-phase">Фаза: ${gameData.phase || 'Ожидание'} - Ночь ${gameData.night || 0}</div>
        <div class="your-role">Ваша роль: ${gameData.playerRole || 'Неизвестно'}</div>
        <div class="players-list">
          ${(gameData.alive || []).map(playerId => {
            const player = gameData.players.find(p => p.user_id === playerId);
            return `<div class="player-card alive">
              <span class="player-name">${player ? player.username : 'Игрок'}</span>
              <span class="player-status">Жив</span>
            </div>`;
          }).join('')}
        </div>
        <div class="werewolf-actions">
          ${gameData.phase === 'day' ? '<button onclick="showVoteDialog(' + gameData.gameId + ')">Голосовать</button>' : ''}
          ${gameData.playerRole === 'werewolf' && gameData.phase === 'night' ? '<button onclick="showKillDialog(' + gameData.gameId + ')">Убить</button>' : ''}
          ${gameData.playerRole === 'seer' && gameData.phase === 'night' ? '<button onclick="showSeerDialog(' + gameData.gameId + ')">Проверить</button>' : ''}
        </div>
      </div>
    `;
  }

  function createBlackjackHTML(gameData) {
    const playerHand = gameData.hands[myId] || [];
    const handValue = calculateBlackjackValue(playerHand);
    
    return `
      <div class="blackjack-game">
        <div class="game-phase">Фаза: ${gameData.phase || 'Ставки'}</div>
        <div class="dealer-hand">
          <h4>Дилер:</h4>
          <div class="cards">
            ${(gameData.dealerHand || []).map(card => 
              `<div class="card">${card.value}${getSuitSymbol(card.suit)}</div>`
            ).join('')}
          </div>
        </div>
        <div class="player-hand">
          <h4>Ваши карты (${handValue}):</h4>
          <div class="cards">
            ${playerHand.map(card => 
              `<div class="card">${card.value}${getSuitSymbol(card.suit)}</div>`
            ).join('')}
          </div>
        </div>
        <div class="blackjack-actions">
          ${gameData.phase === 'betting' ? '<button onclick="placeBet(' + gameData.gameId + ', 10)">Ставка 10</button>' : ''}
          ${gameData.phase === 'playing' ? '<button onclick="hitCard(' + gameData.gameId + ')">Взять карту</button>' : ''}
          ${gameData.phase === 'playing' ? '<button onclick="standCards(' + gameData.gameId + ')">Остановиться</button>' : ''}
        </div>
      </div>
    `;
  }

  function calculateBlackjackValue(hand) {
    let value = 0;
    let aces = 0;
    
    hand.forEach(card => {
      if (card.value === 'A') {
        aces++;
        value += 11;
      } else if (['J', 'Q', 'K'].includes(card.value)) {
        value += 10;
      } else {
        value += parseInt(card.value);
      }
    });
    
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    
    return value;
  }

  function getSuitSymbol(suit) {
    const symbols = {
      hearts: '♥️',
      diamonds: '♦️',
      clubs: '♣️',
      spades: '♠️'
    };
    return symbols[suit] || '';
  }

  function createAliasHTML(gameData) {
    return `
      <div class="alias-game">
        <div class="current-word">${gameData.currentWord || 'Ожидание слова...'}</div>
        <div class="team-score">Команда ${gameData.currentTeam}: ${gameData.score || 0} очков</div>
        <div class="timer">Время: ${gameData.timeLeft || 60}с</div>
        <div class="alias-actions">
          <button onclick="aliasGuessed(${gameData.gameId})">✅ Угадали</button>
          <button onclick="aliasSkip(${gameData.gameId})">⏭️ Пропустить</button>
        </div>
      </div>
    `;
  }

  function createUnoHTML(gameData) {
    return `
      <div class="uno-game">
        <div class="current-card">Текущая карта: ${gameData.currentCard || '?'}</div>
        <div class="player-cards">Ваши карты: ${gameData.playerCards || 0}</div>
        <div class="uno-deck">
          ${(gameData.hand || []).map((card, i) => 
            `<button class="card" onclick="playUnoCard(${gameData.gameId}, ${i})">${card}</button>`
          ).join('')}
        </div>
        <button onclick="drawUnoCard(${gameData.gameId})">Взять карту</button>
      </div>
    `;
  }

  window.downloadFile = function (filename, filetype, base64Data) {
    const link = document.createElement("a");
    link.href = `data:${filetype};base64,${base64Data}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  function updatePollVotes(data) {
    // Обновляем все опции опроса с актуальной статистикой
    if (data.voteStats) {
      data.voteStats.forEach(stat => {
        const optionEl = document.getElementById(`poll_${data.pollId}_option_${stat.option_index}`);
        if (optionEl) {
          optionEl.textContent = `${stat.votes} голосов`;
        }
      });
    } else {
      // Фолбэк для старого формата
      const optionEl = document.getElementById(`poll_${data.pollId}_option_${data.optionIndex}`);
      if (optionEl) {
        const currentText = optionEl.textContent;
        const currentVotes = parseInt(currentText.match(/\d+/)) || 0;
        optionEl.textContent = `${currentVotes + 1} голосов`;
      }
    }
    
    // Показываем кто проголосовал
    showSystemMessage(`📊 ${data.userName} проголосовал в опросе`);
  }

  function updateGameParticipants(data) {
    const participantsEl = document.getElementById(`game_participants_${data.gameId}`);
    if (participantsEl) {
      const currentCount = parseInt(participantsEl.textContent) || 1;
      participantsEl.textContent = `${currentCount + 1} игроков`;
    }
  }

  function updateStickerPanel(stickers) {
    const stickerPanel = document.querySelector('.sticker-panel');
    if (!stickerPanel) return;
    
    // Всегда очищаем панель перед заполнением
    stickerPanel.innerHTML = '';
    
    stickers.forEach(sticker => {
      const button = document.createElement('button');
      button.className = 'sticker-btn';
      button.innerHTML = `${sticker.emoji}<br><small>${sticker.name}</small>`;
      button.onclick = () => {
        sendMessage({
          type: 'sticker',
          stickerId: sticker.id
        });
      };
      stickerPanel.appendChild(button);
    });
  }

  function showFriendRequest(data) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>👥 Запрос в друзья</h3>
        <p>${data.fromUserName} хочет добавить вас в друзья</p>
        <div class="modal-buttons">
          <button onclick="acceptFriend(${data.fromUserId}); this.parentElement.parentElement.parentElement.remove()" class="accept-btn">Принять</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Отклонить</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function showFriendsList(friends) {
    const container = document.getElementById('friendsListContainer');
    if (!container) return;
    
    if (friends.length === 0) {
      container.innerHTML = '<div class="empty-state">👥 У вас пока нет друзей</div>';
      return;
    }
    
    container.innerHTML = friends.map(friend => `
      <div class="friend-item enhanced">
        <div class="friend-avatar">👤</div>
        <div class="friend-info">
          <div class="friend-name">${escapeHtml(friend.username)}</div>
          <div class="friend-status ${friend.is_online ? 'online' : 'offline'}">
            ${friend.is_online ? '🟢 Онлайн' : '⚫ Офлайн'}
          </div>
          ${friend.last_seen ? `<div class="friend-last-seen">Последний раз: ${new Date(friend.last_seen).toLocaleDateString('ru-RU')}</div>` : ''}
        </div>
        <div class="friend-actions">
          ${friend.is_online ? `
            <button onclick="startPrivateChat(${friend.id})" class="friend-btn chat-btn" title="Написать">💬</button>
            <button onclick="inviteToGame(${friend.id})" class="friend-btn game-btn" title="Пригласить в игру">🎮</button>
          ` : ''}
          <button onclick="removeFriend(${friend.id})" class="friend-btn remove-btn" title="Удалить из друзей">❌</button>
        </div>
      </div>
    `).join('');
  }

  window.inviteToGame = function(friendId) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🎮 Приглашение в игру</h3>
        <p>Выберите игру для приглашения:</p>
        <div class="game-invite-options">
          <button onclick="sendGameInvite(${friendId}, 'tic-tac-toe')">⭕ Крестики-нолики</button>
          <button onclick="sendGameInvite(${friendId}, 'word-chain')">🔤 Цепочка слов</button>
          <button onclick="sendGameInvite(${friendId}, 'quiz')">❓ Викторина</button>
          <button onclick="sendGameInvite(${friendId}, 'uno')">🎴 УНО</button>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.sendGameInvite = function(friendId, gameType) {
    sendMessage({ type: 'invite_to_game', friendId, gameType });
    document.querySelector('.modal').remove();
    showSystemMessage('🎮 Приглашение отправлено!');
  };

  window.removeFriend = function(friendId) {
    if (confirm('Вы уверены, что хотите удалить этого пользователя из друзей?')) {
      sendMessage({ type: 'remove_friend', friendId });
    }
  };
  
  function showPrivateRoomsList(rooms) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🔒 Приватные комнаты</h3>
        <div class="rooms-list">
          ${rooms.length === 0 ? '<p>Нет доступных комнат</p>' : rooms.map(room => `
            <div class="room-item">
              <div class="room-info">
                <strong>${room.name}</strong>
                <small>Создал: ${room.creator}</small>
                ${room.has_password ? '🔒' : '🔓'}
              </div>
              <button onclick="joinPrivateRoom(${room.id})" class="accept-btn">Войти</button>
            </div>
          `).join('')}
        </div>
        <div class="modal-buttons">
          <button onclick="createPrivateRoom()" class="accept-btn">Создать комнату</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  window.startPrivateChat = function(userId) {
    const text = prompt('Сообщение:');
    if (text && text.trim()) {
      sendMessage({ type: 'private', to: userId, text: text.trim() });
    }
  };

  function showMusicMessage(data) {
    const el = document.createElement('div');
    el.className = 'message music-message';
    el.innerHTML = `
      <div class="message-header">
        <strong>🎵 ${data.userName} поделился музыкой</strong>
      </div>
      <div class="music-player">
        <a href="${data.url}" target="_blank">🎵 Прослушать</a>
      </div>
    `;
    addMessage(el);
  }

  // Функции для показа экрана
  function handleScreenShareStarted(message) {
    showSystemMessage(`📱 ${message.sharerUserName} начал демонстрацию экрана`);
    
    // Создаем элемент для отображения экрана
    const screenContainer = document.createElement('div');
    screenContainer.id = `screen_${message.sharerUserId}`;
    screenContainer.className = 'screen-share-container';
    screenContainer.innerHTML = `
      <div class="screen-share-header">
        <strong>📱 Экран ${message.sharerUserName}</strong>
        <button onclick="closeScreenShare('${message.sharerUserId}')">✕</button>
      </div>
      <canvas id="screen_canvas_${message.sharerUserId}" class="screen-share-canvas"></canvas>
    `;
    
    document.body.appendChild(screenContainer);
  }
  
  function handleScreenShareStopped(message) {
    showSystemMessage(`📱 Демонстрация экрана завершена`);
    
    // Удаляем элемент показа экрана
    const screenContainer = document.getElementById(`screen_${message.sharerUserId}`);
    if (screenContainer) {
      screenContainer.remove();
    }
  }
  
  function handleScreenShareData(message) {
    const canvas = document.getElementById(`screen_canvas_${message.sharerUserId}`);
    if (canvas && message.data) {
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = message.data;
    }
  }
  
  window.closeScreenShare = function(userId) {
    const screenContainer = document.getElementById(`screen_${userId}`);
    if (screenContainer) {
      screenContainer.remove();
    }
  };

  // Убрано: updateUserLevel

  // Обработка закрытия страницы
  window.addEventListener("beforeunload", () => {
    if (ws) {
      ws.close(1000, "Page closed");
    }
    endCall();
  });

  // Инициализация при загрузке
  window.addEventListener("DOMContentLoaded", () => {
    setVH();
    init();
  });

  // Новые функции
  window.createPrivateRoom = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🔒 Создать приватную комнату</h3>
        <input id="roomName" placeholder="Название комнаты" maxlength="30">
        <input id="roomPassword" type="password" placeholder="Пароль (опционально)" maxlength="20">
        <div class="modal-buttons">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
          <button onclick="submitPrivateRoom()" class="accept-btn">Создать</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.submitPrivateRoom = function() {
    const name = document.getElementById('roomName').value.trim();
    const password = document.getElementById('roomPassword').value;
    if (name) {
      sendMessage({ type: 'create_private_room', name, password });
      document.querySelector('.modal').remove();
    }
  };

  window.joinPrivateRoom = function(roomId) {
    const password = prompt('Введите пароль (если требуется):');
    sendMessage({ type: 'join_private_room', roomId, password: password || '' });
  };

  window.addFriend = function(userId) {
    sendMessage({ type: 'add_friend', targetUserId: userId });
  };

  window.acceptFriend = function(userId) {
    sendMessage({ type: 'accept_friend', targetUserId: userId });
  };

  window.showFriends = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>👥 Управление друзьями</h3>
        <div class="friends-tabs">
          <button class="tab-btn active" onclick="showFriendsTab('list')">Мои друзья</button>
          <button class="tab-btn" onclick="showFriendsTab('add')">Добавить друга</button>
          <button class="tab-btn" onclick="showFriendsTab('requests')">Заявки</button>
        </div>
        <div id="friendsTabContent">
          <div id="friendsListTab" class="tab-content active">
            <div id="friendsListContainer">Загрузка...</div>
          </div>
          <div id="addFriendTab" class="tab-content">
            <input id="friendSearchInput" placeholder="Поиск пользователей..." style="width:100%;padding:12px;margin:8px 0;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;">
            <button onclick="searchUsers()" class="accept-btn" style="width:100%;margin:8px 0;">🔍 Найти пользователей</button>
            <div id="userSearchResults"></div>
          </div>
          <div id="requestsTab" class="tab-content">
            <div id="friendRequestsContainer">Загрузка...</div>
          </div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn" style="margin-top:16px;">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Загружаем список друзей
    sendMessage({ type: 'get_friends' });
    sendMessage({ type: 'get_friend_requests' });
  };

  window.showFriendsTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tab === 'list' ? 'friendsListTab' : 
                          tab === 'add' ? 'addFriendTab' : 'requestsTab').classList.add('active');
  };

  window.searchUsers = function() {
    const query = document.getElementById('friendSearchInput').value.trim();
    if (query) {
      sendMessage({ type: 'search_users', query });
    }
  };

  window.createTournament = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🏆 Создать турнир</h3>
        <div class="tournament-form">
          <select id="tournamentGame" style="width:100%;padding:12px;margin:8px 0;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;">
            <option value="tic-tac-toe">⭕ Крестики-нолики</option>
            <option value="word-chain">🔤 Цепочка слов</option>
            <option value="quiz">❓ Викторина</option>
            <option value="uno">🎴 УНО</option>
            <option value="mafia">🕵️ Мафия</option>
          </select>
          <input id="tournamentName" placeholder="Название турнира" maxlength="50" style="width:100%;padding:12px;margin:8px 0;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;">
          <div style="display:flex;gap:8px;margin:8px 0;">
            <input id="maxPlayers" type="number" placeholder="Макс. игроков" min="4" max="16" value="8" style="flex:1;padding:12px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;">
            <select id="tournamentType" style="flex:1;padding:12px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;">
              <option value="elimination">На выбывание</option>
              <option value="round-robin">Круговой</option>
            </select>
          </div>
          <textarea id="tournamentDescription" placeholder="Описание турнира (необязательно)" style="width:100%;height:60px;padding:12px;margin:8px 0;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;resize:vertical;"></textarea>
        </div>
        <div class="modal-buttons">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
          <button onclick="submitTournament()" class="accept-btn">🏆 Создать турнир</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.submitTournament = function() {
    const gameType = document.getElementById('tournamentGame').value;
    const name = document.getElementById('tournamentName').value.trim();
    const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
    const tournamentType = document.getElementById('tournamentType').value;
    const description = document.getElementById('tournamentDescription').value.trim();
    
    if (!name) {
      alert('Введите название турнира');
      return;
    }
    
    if (maxPlayers < 4 || maxPlayers > 16) {
      alert('Количество игроков должно быть от 4 до 16');
      return;
    }
    
    sendMessage({ 
      type: 'create_tournament', 
      gameType, 
      name, 
      maxPlayers, 
      tournamentType,
      description
    });
    document.querySelector('.modal').remove();
  };

  window.joinTournament = function(tournamentId) {
    sendMessage({ type: 'join_tournament', tournamentId });
  };

  window.sendVideoMessage = function() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
          <div class="modal-content">
            <h3>📹 Записать видео-сообщение</h3>
            <video id="videoPreview" autoplay muted style="width:100%;max-width:400px"></video>
            <div class="modal-buttons">
              <button id="startRecord" class="accept-btn">Начать запись</button>
              <button id="stopRecord" class="reject-btn" disabled>Остановить</button>
              <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        
        const video = document.getElementById('videoPreview');
        video.srcObject = stream;
        
        let mediaRecorder;
        let chunks = [];
        
        document.getElementById('startRecord').onclick = () => {
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = e => chunks.push(e.data);
          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result.split(',')[1];
              sendMessage({
                type: 'file',
                filename: `video_${Date.now()}.webm`,
                filetype: 'video/webm',
                size: blob.size,
                data: base64
              });
            };
            reader.readAsDataURL(blob);
            stream.getTracks().forEach(track => track.stop());
            modal.remove();
          };
          mediaRecorder.start();
          document.getElementById('startRecord').disabled = true;
          document.getElementById('stopRecord').disabled = false;
        };
        
        document.getElementById('stopRecord').onclick = () => {
          mediaRecorder.stop();
        };
      })
      .catch(err => alert('Ошибка доступа к камере: ' + err.message));
  };

  window.showMusicPlayer = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🎵 Музыкальный плеер</h3>
        <input type="url" id="musicUrl" placeholder="Ссылка на музыку (YouTube, SoundCloud)">
        <div class="modal-buttons">
          <button onclick="playMusic()" class="accept-btn">Воспроизвести</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.playMusic = function() {
    const url = document.getElementById('musicUrl').value;
    if (url) {
      sendMessage({ type: 'music', url });
      document.querySelector('.modal').remove();
    }
  };

  window.shareScreen = function() {
    if (!currentRoomId) {
      showSystemMessage('❌ Сначала присоединитесь к звонку');
      return;
    }
    
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia({ 
        video: { 
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 15, max: 30 }
        } 
      })
        .then(stream => {
          // Уведомляем сервер о начале показа экрана
          sendMessage({ 
            type: 'screen_share_start', 
            roomId: currentRoomId 
          });
          
          // Создаем canvas для захвата кадров
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const video = document.createElement('video');
          
          video.srcObject = stream;
          video.play();
          
          let isSharing = true;
          
          // Функция для захвата и отправки кадров
          function captureFrame() {
            if (!isSharing) return;
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            
            // Отправляем кадр как base64
            const frameData = canvas.toDataURL('image/jpeg', 0.7);
            sendMessage({
              type: 'screen_share_data',
              roomId: currentRoomId,
              data: frameData
            });
            
            setTimeout(captureFrame, 200); // 5 FPS
          }
          
          video.onloadedmetadata = () => {
            captureFrame();
          };
          
          // Обработка завершения показа экрана
          stream.getVideoTracks()[0].onended = () => {
            isSharing = false;
            sendMessage({ 
              type: 'screen_share_stop', 
              roomId: currentRoomId 
            });
            showSystemMessage('📱 Демонстрация экрана завершена');
          };
          
          showSystemMessage('📱 Демонстрация экрана начата');
          
          // Добавляем кнопку остановки
          const stopBtn = document.createElement('button');
          stopBtn.textContent = '⏹️ Остановить показ экрана';
          stopBtn.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;padding:10px;background:#dc2626;color:white;border:none;border-radius:8px;cursor:pointer;';
          stopBtn.onclick = () => {
            isSharing = false;
            stream.getTracks().forEach(track => track.stop());
            stopBtn.remove();
          };
          document.body.appendChild(stopBtn);
        })
        .catch(err => {
          console.error('Screen share error:', err);
          showSystemMessage('❌ Ошибка демонстрации экрана');
        });
    } else {
      showSystemMessage('❌ Демонстрация экрана не поддерживается');
    }
  };

  // Новые функции
  window.showCardGames = function() {
    const cardGames = [
      { type: 'uno', name: 'УНО', emoji: '🎴', players: '2-4' },
      { type: 'blackjack', name: 'Блэкджек', emoji: '🃏', players: '2-5' },
      { type: 'poker', name: 'Покер', emoji: '♠️', players: '3-5' },
      { type: 'durak', name: 'Дурак', emoji: '🂡', players: '2-4' }
    ];
    
    const menu = cardGames.map(game => 
      `<button onclick="createGame('${game.type}')" class="game-card">
        <div class="game-icon">${game.emoji}</div>
        <div class="game-name">${game.name}</div>
        <div class="game-players">${game.players} игроков</div>
      </button>`
    ).join('');
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🃏 Карточные игры</h3>
        <div class="card-games-grid">${menu}</div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.showPartyGames = function() {
    const partyGames = [
      { type: 'mafia', name: 'Мафия', emoji: '🕵️', players: '4-8' },
      { type: 'werewolf', name: 'Оборотни', emoji: '🐺', players: '5-10' },
      { type: 'alias', name: 'Алиас', emoji: '💭', players: '4-10' },
      { type: 'crocodile', name: 'Крокодил', emoji: '🐊', players: '3-8' },
      { type: 'spyfall', name: 'Шпион', emoji: '🕴️', players: '3-8' }
    ];
    
    const menu = partyGames.map(game => 
      `<button onclick="createGame('${game.type}')" class="game-card">
        <div class="game-icon">${game.emoji}</div>
        <div class="game-name">${game.name}</div>
        <div class="game-players">${game.players} игроков</div>
      </button>`
    ).join('');
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🎉 Групповые игры</h3>
        <div class="party-games-grid">${menu}</div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.showTranslator = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🌐 Переводчик</h3>
        <div style="display:flex;gap:10px;margin:10px 0;">
          <select id="fromLang" style="padding:5px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;">
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
          <button onclick="swapLanguages()" style="background:var(--primary-blue);color:white;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">⇄</button>
          <select id="toLang" style="padding:5px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;">
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
        <textarea id="sourceText" placeholder="Введите текст для перевода..." style="width:100%;height:100px;margin:10px 0;padding:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;resize:vertical;"></textarea>
        <textarea id="translatedText" placeholder="Перевод появится здесь..." readonly style="width:100%;height:100px;margin:10px 0;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;resize:vertical;"></textarea>
        <div style="display:flex;gap:10px;">
          <button onclick="translateText()" class="accept-btn">Перевести</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.swapLanguages = function() {
    const fromLang = document.getElementById('fromLang');
    const toLang = document.getElementById('toLang');
    const temp = fromLang.value;
    fromLang.value = toLang.value;
    toLang.value = temp;
  };

  window.translateText = function() {
    const sourceText = document.getElementById('sourceText').value.trim();
    const translatedText = document.getElementById('translatedText');
    if (!sourceText) return;
    
    translatedText.value = 'Переводим...';
    setTimeout(() => {
      // Симуляция перевода
      const translations = {
        'привет': 'hello',
        'как дела': 'how are you',
        'спасибо': 'thank you',
        'пока': 'bye'
      };
      const result = translations[sourceText.toLowerCase()] || `[Перевод: ${sourceText}]`;
      translatedText.value = result;
    }, 1000);
  };

  window.showReminders = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>⏰ Напоминания</h3>
        <div id="remindersList" style="max-height:200px;overflow-y:auto;margin:10px 0;">
          <div style="padding:10px;text-align:center;color:var(--text-muted);">Нет активных напоминаний</div>
        </div>
        <div style="display:flex;gap:8px;margin:10px 0;">
          <input id="reminderText" placeholder="Текст напоминания..." style="flex:1;padding:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;">
          <input id="reminderTime" type="datetime-local" style="padding:8px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;">
        </div>
        <div style="display:flex;gap:10px;">
          <button onclick="addReminder()" class="accept-btn">Добавить</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.addReminder = function() {
    const text = document.getElementById('reminderText').value.trim();
    const time = document.getElementById('reminderTime').value;
    if (!text || !time) return;
    
    const remindersList = document.getElementById('remindersList');
    if (remindersList.children[0]?.textContent.includes('Нет активных')) {
      remindersList.innerHTML = '';
    }
    
    const reminder = document.createElement('div');
    reminder.style.cssText = 'padding:8px;margin:4px 0;background:var(--bg-tertiary);border-radius:4px;display:flex;justify-content:space-between;align-items:center;';
    reminder.innerHTML = `
      <div>
        <div style="font-weight:500;">${escapeHtml(text)}</div>
        <div style="font-size:12px;color:var(--text-muted);">${new Date(time).toLocaleString('ru-RU')}</div>
      </div>
      <button onclick="this.parentElement.remove()" style="background:#dc2626;color:white;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">✕</button>
    `;
    remindersList.appendChild(reminder);
    
    document.getElementById('reminderText').value = '';
    document.getElementById('reminderTime').value = '';
    
    // Устанавливаем таймер
    const reminderDate = new Date(time);
    const now = new Date();
    const delay = reminderDate.getTime() - now.getTime();
    
    if (delay > 0) {
      setTimeout(() => {
        showNotification('⏰ Напоминание', { body: text });
        showSystemMessage(`⏰ Напоминание: ${text}`);
      }, delay);
    }
  };

  window.showCalculator = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🧮 Калькулятор</h3>
        <div style="background:var(--bg-tertiary);padding:15px;border-radius:8px;margin:10px 0;">
          <input id="calcDisplay" readonly style="width:100%;padding:10px;font-size:18px;text-align:right;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;margin-bottom:10px;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            <button onclick="clearCalc()" style="grid-column:span 2;padding:10px;background:#dc2626;color:white;border:none;border-radius:4px;cursor:pointer;">C</button>
            <button onclick="calcInput('/')" style="padding:10px;background:var(--primary-blue);color:white;border:none;border-radius:4px;cursor:pointer;">÷</button>
            <button onclick="calcInput('*')" style="padding:10px;background:var(--primary-blue);color:white;border:none;border-radius:4px;cursor:pointer;">×</button>
            <button onclick="calcInput('7')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">7</button>
            <button onclick="calcInput('8')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">8</button>
            <button onclick="calcInput('9')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">9</button>
            <button onclick="calcInput('-')" style="padding:10px;background:var(--primary-blue);color:white;border:none;border-radius:4px;cursor:pointer;">-</button>
            <button onclick="calcInput('4')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">4</button>
            <button onclick="calcInput('5')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">5</button>
            <button onclick="calcInput('6')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">6</button>
            <button onclick="calcInput('+')" style="padding:10px;background:var(--primary-blue);color:white;border:none;border-radius:4px;cursor:pointer;">+</button>
            <button onclick="calcInput('1')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">1</button>
            <button onclick="calcInput('2')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">2</button>
            <button onclick="calcInput('3')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">3</button>
            <button onclick="calculateResult()" style="grid-row:span 2;padding:10px;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;">=</button>
            <button onclick="calcInput('0')" style="grid-column:span 2;padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">0</button>
            <button onclick="calcInput('.')" style="padding:10px;background:var(--bg-secondary);color:var(--text-primary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;">.</button>
          </div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.calcInput = function(value) {
    const display = document.getElementById('calcDisplay');
    if (display.value === '0' && value !== '.') {
      display.value = value;
    } else {
      display.value += value;
    }
  };

  window.clearCalc = function() {
    document.getElementById('calcDisplay').value = '0';
  };

  window.calculateResult = function() {
    const display = document.getElementById('calcDisplay');
    try {
      const result = eval(display.value.replace('×', '*').replace('÷', '/'));
      display.value = result;
    } catch (e) {
      display.value = 'Ошибка';
      setTimeout(() => display.value = '0', 1500);
    }
  };

  window.showDrawing = function() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '90vw';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🎨 Рисование</h3>
        <div style="margin:10px 0;">
          <button onclick="setDrawColor('#ff0000')" style="background:#ff0000;width:30px;height:30px;border:none;border-radius:50%;margin:2px;cursor:pointer;"></button>
          <button onclick="setDrawColor('#00ff00')" style="background:#00ff00;width:30px;height:30px;border:none;border-radius:50%;margin:2px;cursor:pointer;"></button>
          <button onclick="setDrawColor('#0000ff')" style="background:#0000ff;width:30px;height:30px;border:none;border-radius:50%;margin:2px;cursor:pointer;"></button>
          <button onclick="setDrawColor('#ffff00')" style="background:#ffff00;width:30px;height:30px;border:none;border-radius:50%;margin:2px;cursor:pointer;"></button>
          <button onclick="setDrawColor('#ff00ff')" style="background:#ff00ff;width:30px;height:30px;border:none;border-radius:50%;margin:2px;cursor:pointer;"></button>
          <button onclick="setDrawColor('#000000')" style="background:#000000;width:30px;height:30px;border:none;border-radius:50%;margin:2px;cursor:pointer;"></button>
          <input type="range" id="brushSize" min="1" max="20" value="5" style="margin:0 10px;">
          <span>Размер кисти</span>
        </div>
        <canvas id="drawCanvas" width="600" height="400" style="border:2px solid var(--border-color);background:white;border-radius:8px;cursor:crosshair;"></canvas>
        <div style="margin:10px 0;">
          <button onclick="clearCanvas()" class="reject-btn">Очистить</button>
          <button onclick="saveDrawing()" class="accept-btn">Сохранить</button>
          <button onclick="this.parentElement.parentElement.parentElement.remove()" class="reject-btn">Закрыть</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // Инициализация рисования
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let currentColor = '#000000';
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    function startDrawing(e) {
      isDrawing = true;
      draw(e);
    }
    
    function draw(e) {
      if (!isDrawing) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      ctx.lineWidth = document.getElementById('brushSize').value;
      ctx.lineCap = 'round';
      ctx.strokeStyle = currentColor;
      
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    
    function stopDrawing() {
      if (isDrawing) {
        isDrawing = false;
        ctx.beginPath();
      }
    }
    
    window.setDrawColor = function(color) {
      currentColor = color;
    };
    
    window.clearCanvas = function() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    
    window.saveDrawing = function() {
      const dataURL = canvas.toDataURL('image/png');
      const base64 = dataURL.split(',')[1];
      sendMessage({
        type: 'file',
        filename: `drawing_${Date.now()}.png`,
        filetype: 'image/png',
        size: Math.round(base64.length * 0.75),
        data: base64
      });
      showSystemMessage('🎨 Рисунок отправлен в чат');
      modal.remove();
    };
  };

  // Новые функции для игр
  window.showVoteDialog = function(gameId) {
    const modal = document.createElement('div');
    modal.className = 'modal vote-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🗳️ Голосование</h3>
        <p>Выберите игрока для исключения:</p>
        <div class="vote-options" id="voteOptions_${gameId}"></div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.votePlayer = function(gameId, playerId) {
    sendMessage({ type: 'game_move', gameId, move: { vote: playerId } });
    document.querySelector('.vote-modal').remove();
  };

  window.placeBet = function(gameId, amount) {
    sendMessage({ type: 'game_move', gameId, move: { bet: amount } });
  };

  window.hitCard = function(gameId) {
    sendMessage({ type: 'game_move', gameId, move: { action: 'hit' } });
  };

  window.standCards = function(gameId) {
    sendMessage({ type: 'game_move', gameId, move: { action: 'stand' } });
  };

  window.showKillDialog = function(gameId) {
    const modal = document.createElement('div');
    modal.className = 'modal kill-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🐺 Выберите жертву</h3>
        <div class="kill-options" id="killOptions_${gameId}"></div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  window.showSeerDialog = function(gameId) {
    const modal = document.createElement('div');
    modal.className = 'modal seer-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h3>🔮 Проверить игрока</h3>
        <div class="seer-options" id="seerOptions_${gameId}"></div>
        <button onclick="this.parentElement.parentElement.remove()" class="reject-btn">Отмена</button>
      </div>
    `;
    document.body.appendChild(modal);
  };

  // Функция для обновления видео сетки с новыми CSS классами
  function updateVideoGridLayout() {
    const videoGrid = document.querySelector(".video-grid");
    if (!videoGrid) {
      console.error("❌ Video grid not found!");
      return;
    }

    const videoContainers = videoGrid.querySelectorAll(".video-container");
    const count = videoContainers.length;

    console.log(`🎬 Updating video grid layout: ${count} containers`);

    // Удаляем старые классы количества
    videoGrid.classList.remove(
      'count-1', 'count-2', 'count-3', 'count-4', 'count-5', 'count-6',
      'count-7', 'count-8', 'count-9', 'count-10', 'count-11', 'count-12',
      'count-13', 'count-14', 'count-15', 'count-16'
    );

    // Добавляем новый класс в зависимости от количества
    const countClass = `count-${Math.min(count, 16)}`;
    videoGrid.classList.add(countClass);

    // Обновляем индикаторы состояния соединения
    updateConnectionIndicators();

    // Добавляем класс для локального видео
    videoContainers.forEach(container => {
      if (container.id === 'localVideoContainer') {
        container.classList.add('local');
      } else {
        container.classList.remove('local');
      }
    });

    console.log(`✅ Video grid updated with class: ${countClass}`);
  }

  // Функция для обновления индикаторов состояния соединения
  function updateConnectionIndicators() {
    const videoContainers = document.querySelectorAll(".video-container");
    
    videoContainers.forEach(container => {
      const sessionId = container.id.replace('videoContainer_', '').replace('localVideoContainer', '');
      const statusIndicator = container.querySelector('.connection-status');
      
      // Пропускаем локальное видео
      if (container.id === 'localVideoContainer') {
        if (statusIndicator) statusIndicator.remove();
        return;
      }
      
      if (!statusIndicator) {
        // Создаем индикатор если его нет
        const indicator = document.createElement('div');
        indicator.className = 'connection-status';
        container.appendChild(indicator);
      }
      
      const indicator = container.querySelector('.connection-status');
      if (indicator && sessionId) {
        const pc = peerConnections.get(sessionId);
        
        if (!pc) {
          indicator.className = 'connection-status disconnected';
        } else {
          switch (pc.connectionState) {
            case 'connected':
              indicator.className = 'connection-status';
              break;
            case 'connecting':
            case 'new':
              indicator.className = 'connection-status connecting';
              break;
            case 'failed':
            case 'disconnected':
            case 'closed':
              indicator.className = 'connection-status disconnected';
              break;
            default:
              indicator.className = 'connection-status connecting';
          }
        }
      }
    });
  }

  // Функция для диагностики видеозвонков
  window.debugVideoCall = function() {
    console.log('🔍 Video Call Debug Info:');
    console.log('isInCall:', isInCall);
    console.log('currentRoomId:', currentRoomId);
    console.log('localStream:', localStream);
    console.log('peerConnections:', peerConnections);
    console.log('roomUsers:', roomUsers);
    console.log('availableCameras:', availableCameras);
    console.log('currentCamera:', currentCamera);
    
    const videoGrid = document.querySelector('.video-grid');
    if (videoGrid) {
      const containers = videoGrid.querySelectorAll('.video-container');
      console.log('videoContainers:', containers.length);
      containers.forEach((container, index) => {
        console.log(`Container ${index}:`, {
          id: container.id,
          className: container.className,
          hasVideo: !!container.querySelector('video'),
          hasStatus: !!container.querySelector('.connection-status')
        });
      });
    }
    
    if (ws) {
      console.log('WebSocket state:', ws.readyState);
    }
    
    return {
      isInCall,
      currentRoomId,
      peerConnectionsCount: peerConnections.size,
      roomUsersCount: roomUsers.size,
      localStream: !!localStream,
      videoContainers: videoGrid ? videoGrid.querySelectorAll('.video-container').length : 0
    };
  };

  // Функция для периодической проверки состояния соединений
  function monitorConnections() {
    if (!isInCall) return;
    
    peerConnections.forEach((pc, sessionId) => {
      // Проверяем состояние соединения
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.log(`⚠️ Connection issue detected for ${sessionId}:`, pc.connectionState);
        
        // Пробуем перезапустить ICE
        restartIce(sessionId).catch(() => {
          // Если перезапуск не помог, пересоздаем соединение
          recreateConnection(sessionId);
        });
      }
      
      // Проверяем состояние signaling
      if (pc.signalingState === 'failed') {
        console.log(`⚠️ Signaling failed for ${sessionId}`);
        recreateConnection(sessionId);
      }
    });
  }
  
  // Запускаем мониторинг каждые 10 секунд во время звонка
  setInterval(monitorConnections, 10000);
  
  // Функция для мониторинга состояния соединений
  function monitorConnections() {
    if (!isInCall || !currentRoomId) return;
    
    let healthyConnections = 0;
    let totalExpectedConnections = roomUsers.size - 1; // Исключаем себя
    
    peerConnections.forEach((pc, sessionId) => {
      // Проверяем, что пользователь все еще в комнате
      if (!roomUsers.has(sessionId)) {
        console.log(`🗑️ Removing connection to user no longer in room: ${sessionId}`);
        try {
          pc.close();
        } catch (error) {
          console.warn(`⚠️ Error closing orphaned connection:`, error);
        }
        peerConnections.delete(sessionId);
        removeVideoElement(sessionId);
        return;
      }
      
      // Проверяем состояние соединения
      const connectionState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      
      if (connectionState === 'connected') {
        healthyConnections++;
      } else if (connectionState === 'failed' || iceState === 'failed') {
        console.log(`⚠️ Connection failed for ${sessionId}: conn=${connectionState}, ice=${iceState}`);
        
        // Пробуем восстановить соединение
        const attempts = pc.connectionAttempts || 0;
        if (attempts < 3) {
          // Пробуем разные стратегии восстановления
          if (attempts === 0) {
            restartIce(sessionId).catch(() => recreateConnection(sessionId));
          } else if (attempts === 1) {
            // Принудительно используем TURN
            forceTurnConnection(sessionId);
          } else {
            recreateConnection(sessionId);
          }
        } else {
          console.log(`❌ Max attempts reached for ${sessionId}`);
          // Последняя попытка с только TURN
          forceTurnConnection(sessionId);
        }
      } else if (connectionState === 'disconnected') {
        console.log(`⚠️ Connection disconnected for ${sessionId}`);
        
        // Даем время на восстановление, затем пересоздаем
        setTimeout(() => {
          if (pc.connectionState === 'disconnected' && isInCall) {
            recreateConnection(sessionId);
          }
        }, 3000);
      }
    });
    
    // Проверяем, нет ли пропущенных соединений
    roomUsers.forEach((user, sessionId) => {
      if (sessionId !== mySessionId && !peerConnections.has(sessionId)) {
        console.log(`🔍 Missing connection to ${sessionId}, creating...`);
        createOffer(sessionId).catch(error => {
          console.error(`❌ Failed to create missing connection:`, error);
        });
      }
    });
    
    // Обновляем индикаторы
    updateConnectionIndicators();
    
    console.log(`📊 Connection health: ${healthyConnections}/${totalExpectedConnections} healthy`);
  }

  // Запускаем мониторинг каждые 15 секунд во время звонка
  setInterval(monitorConnections, 15000);
  
  // Дополнительный быстрый мониторинг каждые 5 секунд для критических проблем
  setInterval(() => {
    if (!isInCall || !currentRoomId) return;
    
    peerConnections.forEach((pc, sessionId) => {
      if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
        console.log(`🚨 Critical connection failure detected for ${sessionId}`);
        recreateConnection(sessionId);
      }
    });
  }, 5000);

  // Функция для принудительного восстановления всех соединений
  window.recoverAllConnections = function() {
    console.log('🔄 Recovering all connections...');
    peerConnections.forEach((pc, sessionId) => {
      if (pc.connectionState !== 'connected') {
        recreateConnection(sessionId);
      }
    });
  };

  // Функция для принудительного использования TURN
  async function forceTurnConnection(sessionId) {
    console.log(`🔄 Forcing TURN connection for ${sessionId}`);
    
    try {
      // Создаем новое соединение с принудительным TURN
      const turnConfig = {
        iceServers: [
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject"
          },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject"
          }
        ],
        iceCandidatePoolSize: 20,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
        iceTransportPolicy: "relay"
      };
      
      // Закрываем старое соединение
      const oldPc = peerConnections.get(sessionId);
      if (oldPc && oldPc.signalingState !== "closed") {
        oldPc.close();
      }
      peerConnections.delete(sessionId);
      
      // Создаем новое с TURN
      const newPc = new RTCPeerConnection(turnConfig);
      
      // Добавляем базовые обработчики
      newPc.onicecandidate = (event) => {
        if (event.candidate && currentRoomId) {
          sendMessage({
            type: "webrtc_ice_candidate",
            roomId: currentRoomId,
            targetSessionId: sessionId,
            candidate: event.candidate,
          });
        }
      };
      
      newPc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setTimeout(() => {
            if (isInCall && currentRoomId) {
              showRemoteVideo(sessionId, event.streams[0]);
            }
          }, 200);
        }
      };
      
      // Переносим потоки
      if (localStream) {
        localStream.getTracks().forEach(track => {
          newPc.addTrack(track, localStream);
        });
      }
      
      // Заменяем соединение
      peerConnections.set(sessionId, newPc);
      
      // Создаем новый offer
      const offer = await newPc.createOffer();
      await newPc.setLocalDescription(offer);
      
      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId: sessionId,
        offer,
        forceTurn: true
      });
      
      console.log(`✅ TURN connection initiated for ${sessionId}`);
      showSystemMessage(`🔄 Переключаемся на резервный сервер...`);
      
    } catch (error) {
      console.error(`❌ Failed to force TURN for ${sessionId}:`, error);
      handleConnectionFailure(sessionId);
    }
  }

  // Обновленная функция showRemoteVideo с улучшенной обработкой
  const originalShowRemoteVideo = showRemoteVideo;
  showRemoteVideo = function(sessionId, remoteStream) {
    originalShowRemoteVideo(sessionId, remoteStream);
    
    // Добавляем индикатор состояния
    setTimeout(() => {
      updateConnectionIndicators();
    }, 500);
  };

  // Экспорт функций для глобального доступа
  window.chatApp = {
    sendMessage,
    showSystemMessage,
    escapeHtml,
    formatFileSize,
    downloadFile: window.downloadFile,
    votePoll: window.votePoll,
    joinGame: window.joinGame,
    createGame: window.createGame,
    createPoll: window.createPoll,
    createPrivateRoom: window.createPrivateRoom,
    addFriend: window.addFriend,
    showFriends: window.showFriends,
    createTournament: window.createTournament,
    sendVideoMessage: window.sendVideoMessage,
    showMusicPlayer: window.showMusicPlayer,
    shareScreen: window.shareScreen,
    showCardGames: window.showCardGames,
    showPartyGames: window.showPartyGames,
    showTranslator: window.showTranslator,
    showReminders: window.showReminders,
    showCalculator: window.showCalculator,
    showDrawing: window.showDrawing,
    showTournamentMessage,
    updateTournamentParticipants,
    updateTournamentStatus,
    showTournamentRound,
    showTournamentResults,
    showFriendsList,
    inviteToGame: window.inviteToGame,
    sendGameInvite: window.sendGameInvite,
    removeFriend: window.removeFriend,
    // Новые функции для звонков
    startGroupCall,
    endCall,
    updateVideoGridLayout,
    // Функции для внешнего вызова (video-test.html)
    startGroupCallExternal: async function() {
      console.log("📞 Starting group call (external)...");
      
      if (isInCall) {
        showSystemMessage("⚠️ Вы уже находитесь в звонке");
        return;
      }

      try {
        showSystemMessage("🎥 Запрашиваем доступ к камере и микрофону...");
        
        if (!localStream) {
          await initializeLocalStream();
        }

        const roomId = "call_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        console.log("📞 Creating room:", roomId);

        sendMessage({
          type: "create_room",
          roomId: roomId
        });

      } catch (error) {
        console.error("❌ Error starting group call:", error);
        showSystemMessage("❌ Ошибка при начале звонка: " + error.message);
      }
    },
    endCallExternal: function() {
      console.log("📴 Ending call (external)...");
      
      if (!isInCall && !currentRoomId) {
        console.log("No active call to end");
        return;
      }

      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
      }

      const localVideo = document.getElementById("localVideo");
      if (localVideo) {
        localVideo.srcObject = null;
      }

      if (currentRoomId) {
        sendMessage({
          type: "leave_room",
          roomId: currentRoomId
        });
      }

      currentRoomId = null;
      isInCall = false;
      isCallInitiator = false;

      hideVideoCallUI();

      showSystemMessage("📴 Звонок завершён");
      console.log("✅ Call ended");
    },
    debugVideoCall: window.debugVideoCall,
    recoverAllConnections: window.recoverAllConnections,
    monitorConnections,
    forceTurnConnection,
    // Индивидуальный звонок
    startIndividualCall: async function(targetSessionId, isVideo = true) {
      console.log("📞 Starting individual call to:", targetSessionId, "video:", isVideo);
      
      if (isInCall) {
        showSystemMessage("⚠️ Вы уже находитесь в звонке");
        return;
      }

      try {
        showSystemMessage("🎥 Запрашиваем доступ к камере и микрофону...");
        
        if (!localStream) {
          await initializeLocalStream();
        }

        const callId = "call_" + Date.now();
        const roomId = "call_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        
        console.log("📞 Creating call:", callId, "room:", roomId);

        // Создаём комнату на сервере
        sendMessage({
          type: "create_room",
          roomId: roomId
        });

        // Отправляем приглашение конкретному пользователю
        sendMessage({
          type: "call_invite",
          callId: callId,
          roomId: roomId,
          targetSessionId: targetSessionId,
          isVideo: isVideo
        });

        currentRoomId = roomId;
        isInCall = true;
        isCallInitiator = true;
        
        if (videoCallContainer) {
          videoCallContainer.classList.remove("hidden");
        }

        showSystemMessage("📞 Звонок инициирован...");
        
      } catch (error) {
        console.error("❌ Error starting individual call:", error);
        showSystemMessage("❌ Ошибка при начале звонка: " + error.message);
      }
    },
    // Принять звонок
    acceptCall: function() {
      console.log("✅ Accepting call...");
      
      if (!incomingCall) {
        showSystemMessage("⚠️ Нет входящего звонка");
        return;
      }

      sendMessage({
        type: "call_accept",
        callId: incomingCall.callId,
        targetSessionId: incomingCall.fromSessionId,
        roomId: incomingCall.roomId
      });

      currentRoomId = incomingCall.roomId;
      isInCall = true;
      isCallInitiator = false;

      if (incomingCallModal) {
        incomingCallModal.classList.add("hidden");
      }

      if (videoCallContainer) {
        videoCallContainer.classList.remove("hidden");
      }

      showSystemMessage("✅ Вы присоединились к звонку");
      incomingCall = null;
    },
    // Отклонить звонок
    declineCall: function() {
      console.log("❌ Declining call...");
      
      if (!incomingCall) {
        return;
      }

      sendMessage({
        type: "call_reject",
        callId: incomingCall.callId,
        targetSessionId: incomingCall.fromSessionId
      });

      if (incomingCallModal) {
        incomingCallModal.classList.add("hidden");
      }

      showSystemMessage("❌ Звонок отклонён");
      incomingCall = null;
    }
  };

  // ========== ФОНОВЫЙ РЕЖИМ И УВЕДОМЛЕНИЯ ==========
  
  // Обработчик видимости страницы
  function handleVisibilityChange() {
    console.log("👁️ Visibility changed:", document.hidden ? "hidden" : "visible");
    
    if (!document.hidden) {
      // Страница стала активной
      console.log("✅ Page is now visible");
      
      // Очищаем счётчик непрочитанных
      window.unreadCount = 0;
      updateUnreadBadge();
    } else {
      // Страница стала скрытой
      console.log("💤 Page is now hidden");
    }
  }

  // Инициализация уведомлений
  function initializeNotifications() {
    console.log("🔔 Initializing notifications...");
    
    // Регистрируем Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log("✅ Service Worker registered:", reg.scope);
        })
        .catch(err => {
          console.error("❌ Service Worker registration failed:", err);
        });
    }

    // Запрашиваем разрешение на уведомления
    if ('Notification' in window && Notification.permission === 'default') {
      // Автоматически не запрашиваем, ждём действий пользователя
      console.log("📝 Notification permission: default (waiting for user action)");
    }

    // Инициализируем backgroundNotifications
    window.backgroundNotifications = {
      showNotification: function(title, options = {}) {
        if (Notification.permission === 'granted') {
          const notification = new Notification(title, {
            icon: './icon.png',
            badge: './icon.png',
            ...options
          });
          
          notification.onclick = function() {
            window.focus();
            notification.close();
          };
          
          return notification;
        }
        return null;
      },
      
      sendIfHidden: function(title, body, data = {}) {
        if (document.hidden && Notification.permission === 'granted') {
          const notification = new Notification(title, {
            body: body,
            icon: './icon.png',
            badge: './icon.png',
            tag: data.type || 'default',
            requireInteraction: data.requireInteraction || false,
            data: data
          });
          
          notification.onclick = function() {
            window.focus();
            notification.close();
          };
          
          // Увеличиваем счётчик непрочитанных
          window.unreadCount = (window.unreadCount || 0) + 1;
          updateUnreadBadge();
          
          return notification;
        }
        return null;
      }
    };

    // Обработчик visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    console.log("✅ Notifications initialized");
  }

  // Обновление бейджа непрочитанных
  function updateUnreadBadge() {
    const count = window.unreadCount || 0;
    // Можно добавить визуальный индикатор
    document.title = count > 0 ? `(${count}) Чат` : 'Чат';
  }

  // Функция запроса разрешения на уведомления
  function requestNotificationPermission() {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          showSystemMessage("✅ Уведомления включены");
        } else {
          showSystemMessage("❌ Уведомления отключены");
        }
      });
    }
  }

  // Вызываем инициализацию уведомлений
  initializeNotifications();

  // Регистрируем Service Worker для push-уведомлений
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('✅ SW registered'))
        .catch(err => console.error('❌ SW registration failed:', err));
    });
  }

  // ========== КОНЕЦ ФОНОВОГО РЕЖИМА ==========
})();
