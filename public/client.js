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

  // WebRTC конфигурация (улучшенная)
  const rtcConfig = {
    iceServers: [
      // STUN серверы
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },

      // Бесплатные TURN серверы
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:80?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },

      // Дополнительные TURN серверы
      {
        urls: "turn:turn.bistri.com:80",
        username: "homeo",
        credential: "homeo",
      },
      {
        urls: "turn:turn.anyfirewall.com:443?transport=tcp",
        username: "webrtc",
        credential: "webrtc",
      },

      // Новые рабочие серверы
      {
        urls: "turn:relay1.expressturn.com:3478",
        username: "efT5aVqjM7k2bX6",
        credential: "efT5aVqjM7k2bX6",
      },
      {
        urls: "turn:relay2.expressturn.com:3478",
        username: "efT5aVqjM7k2bX6",
        credential: "efT5aVqjM7k2bX6",
      },

      // Xirsys TURN (бесплатный тариф)
      {
        urls: [
          "turn:turn.xirsys.com:80?transport=udp",
          "turn:turn.xirsys.com:3478?transport=udp",
          "turn:turn.xirsys.com:80?transport=tcp",
          "turn:turn.xirsys.com:3478?transport=tcp",
          "turns:turn.xirsys.com:443?transport=tcp",
          "turns:turn.xirsys.com:5349?transport=tcp",
        ],
        username: "your-username",
        credential: "your-token",
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceServersProtocols: ["tcp", "udp"],
  };

  // Конфигурация с принудительным использованием TURN для строгих NAT
  const rtcConfigRelay = {
    ...rtcConfig,
    iceTransportPolicy: "relay",
  };

  // Инициализация приложения
  function init() {
    checkBrowserSupport();
    setupEventListeners();
    initializeEmojiPanel();
    initializeVoiceRecording();
    initializeNotifications();
    loadUserName();
    connectWebSocket();
    preloadMicrophoneAccess();
  }

  async function preloadMicrophoneAccess() {
    try {
      // Пробуем получить доступ к микрофону при загрузке страницы
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Немедленно освобождаем поток
      stream.getTracks().forEach((track) => track.stop());

      console.log("✅ Microphone preloaded successfully");
    } catch (error) {
      console.log(
        "ℹ️ Microphone preload failed (user hasn't granted permission yet)"
      );
    }
  }

  function checkBrowserSupport() {
    const issues = [];

    // Проверка MediaRecorder
    if (typeof MediaRecorder === "undefined") {
      issues.push("запись голосовых сообщений");
    }

    // Проверка getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      issues.push("доступ к микрофону");
    }

    // Проверка WebAudio API
    if (!window.AudioContext && !window.webkitAudioContext) {
      issues.push("воспроизведение аудио");
    }

    if (issues.length > 0) {
      showSystemMessage(`⚠️ Ваш браузер не поддерживает: ${issues.join(", ")}`);
    }
  }

  function debugConnectionsDetailed() {
    console.log("🔍 DETAILED CONNECTION DEBUG:");
    console.log(`Room Users: ${roomUsers.size}`);
    roomUsers.forEach((user, sessionId) => {
      const pc = peerConnections.get(sessionId);
      console.log(
        `- ${user.userName} (${sessionId}) ${
          sessionId === mySessionId ? "(You)" : ""
        }`,
        {
          peerConnection: pc
            ? {
                connectionState: pc.connectionState,
                iceConnectionState: pc.iceConnectionState,
                signalingState: pc.signalingState,
                hasLocalDescription: !!pc.localDescription,
                hasRemoteDescription: !!pc.remoteDescription,
              }
            : "NO PEER CONNECTION",
        }
      );
    });
  }

  // Настройка обработчиков событий
  function setupEventListeners() {
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

    // Голосовые сообщения
    voiceMessageBtn.addEventListener("click", async () => {
      try {
        // Сначала проверяем доступ
        const stream = await requestMicrophone();
        if (stream) {
          // Если доступ есть, начинаем запись
          startVoiceRecording();
        } else {
          showSystemMessage("❌ Не удалось получить доступ к микрофону");
        }
      } catch (error) {
        showSystemMessage("❌ Ошибка доступа к микрофону");
      }
    });

    const sidebarToggle = document.getElementById("sidebarToggle");
    const mobileSidebarToggle = document.getElementById("mobileSidebarToggle");
    const closeSidebar = document.getElementById("closeSidebar");
    const overlay = document.getElementById("overlay");

    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", toggleSidebar);
    }

    if (mobileSidebarToggle) {
      mobileSidebarToggle.addEventListener("click", toggleSidebar);
    }

    if (closeSidebar) {
      closeSidebar.addEventListener("click", toggleSidebar);
    }

    if (overlay) {
      overlay.addEventListener("click", toggleSidebar);
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

    // Запись голоса
    stopRecordBtn.addEventListener("click", stopVoiceRecording);
    cancelRecordBtn.addEventListener("click", cancelVoiceRecording);

    // Адаптивность
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", setVH);

    // Уведомления
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function initializeEmojiPanel() {
    const emojiPanel = document.querySelector(".emoji-panel");
    if (!emojiPanel) return;

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

    emojiPanel.innerHTML = "";
    emojis.forEach((emoji) => {
      const button = document.createElement("button");
      button.textContent = emoji;
      button.type = "button";
      button.addEventListener("click", () => {
        sendMessage({ type: "reaction", emoji });
      });
      emojiPanel.appendChild(button);
    });
  }

  function initializeVoiceRecording() {
    // Создаем визуализационные бары
    voiceRecordVisualization.innerHTML = "";
    for (let i = 0; i < 40; i++) {
      const bar = document.createElement("div");
      bar.className = "voice-record-bar";
      bar.style.height = "2px";
      voiceRecordVisualization.appendChild(bar);
      visualizationBars.push(bar);
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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      const { action, data } = event.data;

      switch (action) {
        case "notification-click":
          handleNotificationClick(data);
          break;
        case "notification-action":
          handleNotificationAction(data);
          break;
      }
    });
  }

  function handleNotificationClick(data) {
    // Фокусируем окно при клике на уведомление
    window.focus();

    // Прокручиваем к последним сообщениям
    scrollToBottom();
  }

  function handleNotificationAction(data) {
    const { action, notification } = data;

    switch (action) {
      case "open":
        window.focus();
        scrollToBottom();
        break;
      case "accept-call":
        if (incomingCall) {
          acceptCall();
        }
        break;
      case "reject-call":
        if (incomingCall) {
          rejectCall();
        }
        break;
      case "join-call":
        // Логика присоединения к групповому звонку
        if (activeCalls.length > 0) {
          joinGroupCall(activeCalls[0].roomId);
        }
        break;
    }

    // Закрываем уведомление
    notification.close();
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      // Страница скрыта - можно показывать уведомления
      if (incomingCall) {
        notifyIncomingCall(incomingCall);
      }
    } else {
      // Страница активна - очищаем уведомления
      if (serviceWorkerRegistration) {
        serviceWorkerRegistration.getNotifications().then((notifications) => {
          notifications.forEach((notification) => notification.close());
        });
      }
    }
  }

  async function subscribeToPush(registration) {
    try {
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        // Создаем новую подписку
        const vapidPublicKey = "YOUR_VAPID_PUBLIC_KEY"; // Нужно сгенерировать VAPID ключи
        const newSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        console.log("✅ Push subscription created:", newSubscription);
        // Здесь нужно отправить subscription на ваш сервер
      } else {
        console.log("✅ Push subscription exists:", subscription);
      }
    } catch (error) {
      console.warn("⚠️ Push subscription failed:", error);
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Функции для голосовых сообщений
  async function startVoiceRecording() {
    try {
      console.log("🎤 Starting voice recording...");

      // Проверяем поддержку
      if (typeof MediaRecorder === "undefined") {
        showSystemMessage("❌ Ваш браузер не поддерживает запись аудио");
        return;
      }

      // Пробуем разные конфигурации для совместимости
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100,
          sampleSize: 16,
        },
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.warn("⚠️ Primary constraints failed, trying basic audio...");
        // Пробуем базовые настройки
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error("No audio tracks available");
      }

      console.log("✅ Microphone access granted");

      // Определяем поддерживаемый формат
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/wav",
        "audio/aac",
      ];

      let supportedType = "";
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          supportedType = type;
          console.log("🎵 Using supported format:", type);
          break;
        }
      }

      if (!supportedType) {
        // Используем формат по умолчанию и надеемся на лучшее
        supportedType = "audio/webm";
        console.warn("⚠️ No specific format supported, using default");
      }

      // Создаем MediaRecorder с обработкой ошибок
      let mediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: supportedType,
          audioBitsPerSecond: 128000,
        });
      } catch (error) {
        console.warn(
          "⚠️ MediaRecorder creation failed, trying without mimeType"
        );
        mediaRecorder = new MediaRecorder(stream);
      }

      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.onerror = (event) => {
        console.error("❌ MediaRecorder error:", event.error);
        showSystemMessage("❌ Ошибка записи");
        cancelVoiceRecording();
      };

      // Запускаем запись с разными интервалами для совместимости
      try {
        mediaRecorder.start(100);
      } catch (error) {
        console.warn("⚠️ Start with timeslice failed, trying without");
        mediaRecorder.start();
      }

      isRecording = true;
      recordingStartTime = Date.now();

      // Обновляем UI
      voiceMessageBtn.classList.add("recording");
      voiceRecordModal.classList.remove("hidden");
      startRecordingTimer();

      console.log("✅ Voice recording started successfully");
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
    }
  }

  function startVisualization(dataArray, bufferLength) {
    visualizationInterval = setInterval(() => {
      if (!isRecording) return;

      analyser.getByteFrequencyData(dataArray);

      // Обновляем бары визуализации
      const barCount = visualizationBars.length;
      const step = Math.floor(bufferLength / barCount);

      visualizationBars.forEach((bar, index) => {
        const value = dataArray[index * step] || 0;
        const height = Math.max(2, (value / 255) * 80);
        bar.style.height = `${height}px`;
        bar.style.background = `hsl(${200 + (value / 255) * 60}, 100%, 50%)`;
      });
    }, 50);
  }

  function startRecordingTimer() {
    recordingTimer = setInterval(() => {
      if (!isRecording) return;

      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (elapsed % 60).toString().padStart(2, "0");

      voiceRecordTimer.textContent = `${minutes}:${seconds}`;

      // Автоматическая остановка через 2 минуты
      if (elapsed >= 120) {
        stopVoiceRecording();
      }
    }, 1000);
  }

  // Запрос доступа к микрофону
  async function requestMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      console.log("Микрофон доступен");
      return stream;
    } catch (error) {
      console.error("Ошибка доступа к микрофону:", error);
    }
  }

  function stopVoiceRecording() {
    if (!isRecording || !mediaRecorder) return;

    mediaRecorder.stop();
    isRecording = false;

    // Останавливаем все потоки
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());

    // Очищаем интервалы
    clearInterval(recordingTimer);
    clearInterval(visualizationInterval);

    // Сбрасываем визуализацию
    visualizationBars.forEach((bar) => {
      bar.style.height = "2px";
      bar.style.background = "var(--primary-red)";
    });

    // Закрываем AudioContext
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    // Скрываем модальное окно
    voiceRecordModal.classList.add("hidden");
    voiceMessageBtn.classList.remove("recording");
  }

  function cancelVoiceRecording() {
    if (!isRecording) return;

    mediaRecorder.stop();
    isRecording = false;

    // Останавливаем все потоки
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());

    // Очищаем интервалы
    clearInterval(recordingTimer);
    clearInterval(visualizationInterval);

    // Сбрасываем визуализацию
    visualizationBars.forEach((bar) => {
      bar.style.height = "2px";
      bar.style.background = "var(--primary-red)";
    });

    // Закрываем AudioContext
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    // Сбрасываем данные
    audioChunks = [];

    // Скрываем модальное окно
    voiceRecordModal.classList.add("hidden");
    voiceMessageBtn.classList.remove("recording");

    showSystemMessage("❌ Запись отменена");
  }

  async function handleRecordingStop() {
    try {
      if (audioChunks.length === 0) {
        showSystemMessage("❌ Запись отсутствует или слишком короткая");
        return;
      }

      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

      if (duration < 1) {
        showSystemMessage("❌ Запись слишком короткая (минимум 1 секунда)");
        return;
      }

      if (duration > 120) {
        showSystemMessage("❌ Запись слишком длинная (максимум 2 минуты)");
        return;
      }

      showSystemMessage("🔄 Обработка записи...");

      // Создаем Blob из chunks
      const audioBlob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });

      // Конвертируем в base64
      const reader = new FileReader();

      reader.onload = () => {
        const base64 = reader.result.split(",")[1];

        // Определяем расширение файла
        let fileExtension = "webm";
        if (mediaRecorder.mimeType.includes("ogg")) fileExtension = "ogg";
        if (mediaRecorder.mimeType.includes("mp4")) fileExtension = "mp4";
        if (mediaRecorder.mimeType.includes("wav")) fileExtension = "wav";

        // Отправляем сообщение
        sendMessage({
          type: "file",
          filename: `voice_${Date.now()}.${fileExtension}`,
          filetype: mediaRecorder.mimeType || "audio/webm",
          size: audioBlob.size,
          data: base64,
          duration: duration,
        });

        showSystemMessage("✅ Голосовое сообщение отправлено");
      };

      reader.onerror = () => {
        console.error("❌ Error reading audio blob");
        showSystemMessage("❌ Ошибка обработки записи");
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error("❌ Error processing recording:", error);
      showSystemMessage("❌ Ошибка обработки записи");
    } finally {
      // Всегда очищаем chunks
      audioChunks = [];
    }
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
        <div class="voice-controls">
          <button class="play-pause-btn" data-audio="${
            data.data
          }" data-duration="${data.duration || 0}">▶️</button>
          <div class="voice-visualization" id="visualization_${data.ts}">
            <!-- Визуализация будет создана динамически -->
          </div>
          <div class="voice-duration">${formatDuration(
            data.duration || 0
          )}</div>
        </div>
        <div class="voice-progress">
          <div class="voice-progress-bar" style="width: 0%"></div>
        </div>
      </div>
    `;

    // Инициализируем визуализацию для этого сообщения
    initializeVoiceVisualization(el, data.duration || 0);

    addMessage(el, isHistory);

    // Добавляем обработчик для кнопки воспроизведения
    const playBtn = el.querySelector(".play-pause-btn");
    playBtn.addEventListener("click", handleVoicePlayback);
  }

  function initializeVoiceVisualization(element, duration) {
    const visualization = element.querySelector(".voice-visualization");
    visualization.innerHTML = "";

    const barCount = Math.min(40, Math.floor(duration * 2));
    for (let i = 0; i < barCount; i++) {
      const bar = document.createElement("div");
      bar.className = "voice-bar";
      bar.style.height = "2px";
      bar.style.background = "var(--bg-secondary)";
      visualization.appendChild(bar);
    }
  }

  function handleVoicePlayback(event) {
    const button = event.target.closest(".play-pause-btn");
    if (!button) return;

    const audioData = button.getAttribute("data-audio");
    const duration = parseInt(button.getAttribute("data-duration"));

    if (!audioData) {
      showSystemMessage("❌ Ошибка воспроизведения: данные отсутствуют");
      return;
    }

    try {
      // Пробуем разные MIME types для совместимости
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/wav",
        "audio/mpeg",
      ];

      let audio;
      let success = false;

      for (const mimeType of mimeTypes) {
        try {
          audio = new Audio(`data:${mimeType};base64,${audioData}`);
          audio.preload = "auto";
          success = true;
          break;
        } catch (e) {
          continue;
        }
      }

      if (!success) {
        // Последняя попытка без указания MIME type
        audio = new Audio(`data:audio/webm;base64,${audioData}`);
      }

      audio.volume = 0.8;

      // Останавливаем все другие воспроизведения
      document.querySelectorAll(".play-pause-btn").forEach((btn) => {
        if (btn !== button && btn.getAttribute("data-audio-instance")) {
          const otherAudio = btn.getAttribute("data-audio-instance");
          try {
            otherAudio.pause();
            otherAudio.currentTime = 0;
          } catch (e) {}
          btn.textContent = "▶️";
          btn.removeAttribute("data-audio-instance");

          const otherBars = btn.parentElement.querySelectorAll(".voice-bar");
          const otherProgress = btn.parentElement.parentElement.querySelector(
            ".voice-progress-bar"
          );
          resetVisualization(otherBars, otherProgress);
        }
      });

      if (button.getAttribute("data-audio-instance")) {
        // Останавливаем текущее воспроизведение
        const currentAudio = button.getAttribute("data-audio-instance");
        currentAudio.pause();
        button.textContent = "▶️";
        button.removeAttribute("data-audio-instance");

        const bars = button.parentElement.querySelectorAll(".voice-bar");
        const progressBar = button.parentElement.parentElement.querySelector(
          ".voice-progress-bar"
        );
        resetVisualization(bars, progressBar);
      } else {
        // Начинаем воспроизведение
        button.textContent = "⏸️";
        button.setAttribute("data-audio-instance", audio);

        const visualization = button.parentElement.querySelector(
          ".voice-visualization"
        );
        const progressBar = button.parentElement.parentElement.querySelector(
          ".voice-progress-bar"
        );
        const bars = visualization.querySelectorAll(".voice-bar");

        audio.addEventListener("timeupdate", () => {
          if (audio.duration && progressBar) {
            const progress = (audio.currentTime / audio.duration) * 100;
            progressBar.style.width = `${progress}%`;
          }
        });

        audio.addEventListener("ended", () => {
          button.textContent = "▶️";
          button.removeAttribute("data-audio-instance");
          resetVisualization(bars, progressBar);
          if (progressBar) {
            progressBar.style.width = "0%";
          }
        });

        audio.addEventListener("error", (e) => {
          console.error("❌ Audio playback error:", e);
          button.textContent = "▶️";
          button.removeAttribute("data-audio-instance");
          resetVisualization(bars, progressBar);
          showSystemMessage("❌ Ошибка воспроизведения аудио");

          // Пробуем альтернативный метод
          setTimeout(() => {
            try {
              const altAudio = new Audio(`data:audio/wav;base64,${audioData}`);
              altAudio.play().catch(() => {});
            } catch (altError) {
              console.error("Alternative playback also failed:", altError);
            }
          }, 100);
        });

        // Запускаем воспроизведение
        const playPromise = audio.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("✅ Audio playback started");
              startPlaybackVisualization(
                audio,
                bars,
                progressBar,
                duration || audio.duration
              );
            })
            .catch((error) => {
              console.error("❌ Audio play failed:", error);
              button.textContent = "▶️";
              button.removeAttribute("data-audio-instance");

              if (error.name === "NotAllowedError") {
                showSystemMessage(
                  "❌ Нажмите на страницу чтобы разрешить воспроизведение"
                );
              }
            });
        }
      }
    } catch (error) {
      console.error("❌ Error setting up audio playback:", error);
      showSystemMessage("❌ Ошибка воспроизведения аудио");
    }
  }

  function startPlaybackVisualization(audio, bars, progressBar, duration) {
    const updateVisualization = () => {
      if (audio.paused || audio.ended) return;

      const currentTime = audio.currentTime;
      const progress = (currentTime / duration) * 100;
      progressBar.style.width = `${progress}%`;

      // Анимируем бары визуализации
      bars.forEach((bar, index) => {
        const barProgress = (index / bars.length) * 100;
        if (barProgress <= progress) {
          const intensity = Math.random() * 0.7 + 0.3;
          const height = Math.max(2, 20 * intensity);
          bar.style.height = `${height}px`;
          bar.style.background = `hsl(${200 + intensity * 60}, 100%, 50%)`;
        } else {
          bar.style.height = "2px";
          bar.style.background = "var(--bg-secondary)";
        }
      });

      requestAnimationFrame(updateVisualization);
    };

    updateVisualization();
  }

  function resetVisualization(bars, progressBar) {
    progressBar.style.width = "0%";
    bars.forEach((bar) => {
      bar.style.height = "2px";
      bar.style.background = "var(--bg-secondary)";
    });
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  function getWebSocketUrl() {
    // Для продакшена - ваш backend сервер
    if (window.location.hostname.includes("vercel.app")) {
      return "wss://aqqqqqq-2.onrender.com"; // Замените на ваш сервер
    }
    return "ws://localhost:3000";
  }

  // WebSocket соединение
  function connectWebSocket() {
    const wsUrl = getWebSocketUrl();

    try {
      ws = new WebSocket(wsUrl);
      setupWebSocketHandlers();
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      handleConnectionError();
    }
  }

  function setupWebSocketHandlers() {
    ws.onopen = () => {
      console.log("✅ Connected to server");
      isConnected = true;
      reconnectAttempts = 0;
      showSystemMessage("✅ Подключено к серверу");
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
      console.error("WebSocket error:", error);
      showSystemMessage("❌ Ошибка соединения с сервером");
    };

    ws.onclose = (event) => {
      console.log("❌ Disconnected from server:", event.code, event.reason);
      isConnected = false;

      if (
        event.code === 4000 &&
        event.reason === "Duplicate session closed by new connection"
      ) {
        console.log(
          "🔄 Duplicate session closed normally, no reconnection needed"
        );
        showSystemMessage(
          "🔄 Сессия закрыта (вы подключены с другого устройства/вкладки)"
        );
        return;
      }

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
      case "message":
        showMessage(message);
        notifyNewMessage(message);
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

      default:
        console.log("❌ Unknown message type:", message);
    }
  }

  // В функции handleInitMessage в client.js
  function handleInitMessage(message) {
    mySessionId = message.sessionId;

    // ЗАГРУЖАЕМ сохраненное имя из localStorage
    const savedName = localStorage.getItem("chatUserName");

    if (savedName && nameInput) {
      nameInput.value = savedName;
      console.log(`✅ Name loaded from storage: ${savedName}`);

      // Отправляем имя на сервер с задержкой для стабильности соединения
      setTimeout(() => {
        if (isConnected && ws.readyState === WebSocket.OPEN) {
          sendMessage({ type: "setName", name: savedName });
          console.log(`✅ Name sent to server: ${savedName}`);
        } else {
          // Если соединение не готово, пробуем позже
          setTimeout(() => {
            if (isConnected) {
              sendMessage({ type: "setName", name: savedName });
            }
          }, 2000);
        }
      }, 1000);
    } else {
      // Если нет сохраненного имени - предлагаем ввести
      showSystemMessage("⚠️ Пожалуйста, установите имя в настройках");
    }
  }

  // ДОБАВИТЬ при загрузке страницы
  function loadUserName() {
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
        }
      });
      historyLoaded = true;
    }
  }

  // Отправка сообщений
  function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending message:", error);
        showSystemMessage("❌ Ошибка отправки сообщения");
      }
    } else {
      showSystemMessage("❌ Нет подключения к серверу");
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

  function handleNameChange() {
    const name = nameInput.value.trim();

    if (!name) {
      showSystemMessage("❌ Имя не может быть пустым");
      return;
    }

    if (name.length > 50) {
      showSystemMessage("❌ Имя слишком длинное (максимум 50 символов)");
      return;
    }

    if (!/^[a-zA-Zа-яА-Я0-9_-\s]+$/.test(name)) {
      showSystemMessage("❌ Имя содержит недопустимые символы");
      return;
    }

    if (name && isConnected) {
      // Сохраняем в localStorage ПЕРЕД отправкой на сервер
      localStorage.setItem("chatUserName", name);
      console.log(`✅ Name saved to localStorage: ${name}`);

      sendMessage({ type: "setName", name: name });

      // Показываем подтверждение
      showSystemMessage(`🔄 Отправка имени на сервер...`);
    } else if (!isConnected) {
      showSystemMessage("❌ Нет подключения к серверу");
    }
  }

  function handleNameUpdated(message) {
    if (message.userId === myId) {
      localStorage.setItem("chatUserName", message.newName);
      showSystemMessage(`✅ Теперь вас зовут ${message.newName}`);
    }
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
  }

  function showSystemMessage(text, isHistory = false) {
    const el = document.createElement("div");
    el.className = "system";
    el.textContent = text;
    addMessage(el, isHistory);
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

  function showFileMessage(data, isHistory = false) {
    const el = document.createElement("div");
    el.className = `message file-message ${data.id === myId ? "me" : ""}`;

    let previewHtml = "";
    if (data.filetype && data.filetype.startsWith("image/")) {
      previewHtml = `<img src="data:${data.filetype};base64,${data.data}" alt="${data.filename}" loading="lazy">`;
    } else if (data.filetype && data.filetype.startsWith("video/")) {
      previewHtml = `<video controls><source src="data:${data.filetype};base64,${data.data}" type="${data.filetype}"></video>`;
    } else if (data.filetype && data.filetype.startsWith("audio/")) {
      previewHtml = `<audio controls><source src="data:${data.filetype};base64,${data.data}" type="${data.filetype}"></audio>`;
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

  async function initializeNotifications() {
    try {
      // Запрашиваем разрешение на уведомления
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        notificationPermission = permission === "granted";

        if (notificationPermission) {
          console.log("✅ Уведомления разрешены");

          // Регистрируем сервис-воркер для PUSH уведомлений
          if ("serviceWorker" in navigator) {
            try {
              const registration = await navigator.serviceWorker.register(
                "/sw.js"
              );
              serviceWorkerRegistration = registration;
              console.log("✅ Service Worker зарегистрирован");

              // Подписываемся на push уведомления
              await subscribeToPush(registration);
            } catch (error) {
              console.warn("⚠️ Service Worker не зарегистрирован:", error);
            }
          }
        } else {
          console.log("❌ Уведомления не разрешены");
        }
      }
    } catch (error) {
      console.error("❌ Ошибка инициализации уведомлений:", error);
    }
  }

  // Функция показа уведомления
  function showNotification(title, options = {}) {
    if (!notificationPermission) return;

    // Проверяем видимость страницы
    if (document.hidden) {
      if ("serviceWorker" in navigator && serviceWorkerRegistration) {
        // Используем сервис-воркер для показа уведомления
        serviceWorkerRegistration.showNotification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          vibrate: [200, 100, 200],
          ...options,
        });
      } else if ("Notification" in window) {
        // Используем стандартные уведомления
        new Notification(title, {
          icon: "/favicon.ico",
          ...options,
        });
      }
    }
  }

  // Функция для отправки уведомления о новом сообщении
  function notifyNewMessage(message) {
    showNotification(`Новое сообщение от ${message.name}`, {
      body: message.text || "📎 Вложение",
      tag: "new-message",
      requireInteraction: true,
      actions: [
        {
          action: "open",
          title: "📖 Открыть чат",
        },
        {
          action: "close",
          title: "❌ Закрыть",
        },
      ],
    });
  }

  // Функция для уведомления о входящем звонке
  function notifyIncomingCall(callInfo) {
    showNotification(`Входящий звонок от ${callInfo.fromUserName}`, {
      body: callInfo.isGroupCall
        ? "👥 Групповой звонок"
        : "📞 Индивидуальный звонок",
      tag: "incoming-call",
      requireInteraction: true,
      vibrate: [500, 200, 500, 200, 500],
      actions: [
        {
          action: "accept-call",
          title: "📞 Принять",
        },
        {
          action: "reject-call",
          title: "❌ Отклонить",
        },
      ],
    });
  }

  // Функция для уведомления о системных событиях
  function notifySystemEvent(title, body) {
    showNotification(title, {
      body: body,
      tag: "system-event",
    });
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

  async function processPendingIceCandidates(pc, sessionId) {
    if (!pc.pendingIceCandidates || pc.pendingIceCandidates.length === 0) {
      return;
    }

    console.log(
      `🔄 Processing ${pc.pendingIceCandidates.length} pending ICE candidates for ${sessionId}`
    );

    while (pc.pendingIceCandidates.length > 0) {
      const candidate = pc.pendingIceCandidates.shift();
      try {
        await pc.addIceCandidate(candidate);
        console.log(`🧊 Added pending ICE candidate from ${sessionId}`);
      } catch (error) {
        console.warn("⚠️ Error adding pending ICE candidate:", error);
      }
    }
  }

  async function joinGroupCall(roomId) {
    if (isInCall) {
      showSystemMessage("❌ Вы уже в звонке");
      return;
    }

    hideActiveCallsModal();
    showSystemMessage("🎥 Запрашиваем доступ к камере и микрофону...");

    try {
      await initializeLocalStream();

      currentRoomId = roomId;
      isInCall = true;
      isCallInitiator = false;

      sendMessage({ type: "join_group_call", roomId: roomId });
      showVideoCallUI();
      showSystemMessage("✅ Вы присоединились к групповому звонку");
    } catch (error) {
      console.error("Error joining group call:", error);
      showSystemMessage("❌ Ошибка присоединения к звонку");
    }
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

    if (
      document.hidden &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      new Notification(`Личное сообщение от ${data.name}`, {
        body: data.text,
        icon: "/favicon.ico",
      });
    }
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
      await initializeLocalStream();
      isCallInitiator = true;
      sendMessage({ type: "create_room" });
      showSystemMessage("👥 Создаем групповой звонок...");
    } catch (error) {
      console.error("Error starting group call:", error);
      showSystemMessage(
        "❌ Не удалось начать звонок. Проверьте разрешения для камеры/микрофона."
      );
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

  async function initializeLocalStream() {
    try {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      console.log("🎯 Requesting media stream with both audio and video...");

      // Запрашиваем медиа с более конкретными настройками для аудио
      localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
          // Явно запрашиваем определенные устройства если нужно
          // deviceId: preferredAudioDeviceId
        },
      });

      // Детальная проверка полученных треков
      const audioTracks = localStream.getAudioTracks();
      const videoTracks = localStream.getVideoTracks();

      console.log("✅ Media stream obtained:", {
        audioTracks: audioTracks.length,
        videoTracks: videoTracks.length,
        audioTrackDetails: audioTracks.map((track) => ({
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted,
          kind: track.kind,
          label: track.label,
          settings: track.getSettings(),
        })),
      });

      // ВАЖНО: Гарантируем что аудио треки включены
      audioTracks.forEach((track) => {
        if (!track.enabled) {
          console.log("🔊 Enabling audio track that was disabled");
          track.enabled = true;
        }
      });

      if (audioTracks.length === 0) {
        console.warn(
          "⚠️ No audio tracks obtained, trying audio-only fallback..."
        );

        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 48000,
            },
          });

          const audioOnlyTracks = audioOnlyStream.getAudioTracks();
          console.log(
            `✅ Audio-only fallback obtained ${audioOnlyTracks.length} audio tracks`
          );

          // Добавляем аудио треки к существующему потоку или заменяем его
          if (videoTracks.length > 0) {
            // Если есть видео, добавляем аудио к нему
            audioOnlyTracks.forEach((track) => {
              localStream.addTrack(track);
            });
          } else {
            // Если нет видео, используем только аудио
            localStream = audioOnlyStream;
          }
        } catch (audioError) {
          console.error("❌ Audio-only fallback also failed:", audioError);
          throw new Error("Cannot access microphone");
        }
      }

      if (localVideo) {
        localVideo.srcObject = localStream;
        // Включаем звук для локального видео (для тестирования)
        localVideo.muted = true; // Локальное видео обычно без звука
      }

      console.log("✅ Local stream initialized successfully with audio");
      return localStream;
    } catch (error) {
      console.error("❌ Error accessing media devices:", error);

      // Финальная попытка - только базовое аудио
      try {
        console.log("🔄 Trying basic audio only...");
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        const audioTracks = localStream.getAudioTracks();
        console.log(`✅ Basic audio obtained ${audioTracks.length} tracks`);

        if (localVideo) {
          localVideo.srcObject = null;
        }

        return localStream;
      } catch (finalError) {
        console.error("❌ All media access attempts failed:", finalError);
        showSystemMessage(
          "❌ Не удалось получить доступ к микрофону. Проверьте разрешения."
        );
        throw error;
      }
    }
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

    const initStreamAndUI = async () => {
      try {
        await initializeLocalStream();
      } catch (e) {
        console.error("Error initializing local stream for caller:", e);
        showSystemMessage(
          "⚠️ Нет доступа к камере/микрофону. Продолжаем без видео."
        );
      }
      showVideoCallUI();
      setTimeout(() => {
        updateRoomUsers();
      }, 1000);
    };
    initStreamAndUI();

    showSystemMessage(`📞 Звонок начат с ${message.targetUserName}`);
  }

  function handleRoomCreated(message) {
    currentRoomId = message.roomId;
    isInCall = true;
    showVideoCallUI();
    showSystemMessage(message.message || "✅ Комната создана");

    // ИСПРАВЛЕНИЕ: Инициализируем локальный поток если еще не сделали
    if (!localStream) {
      initializeLocalStream()
        .then(() => {
          console.log("✅ Local stream initialized for room creator");
        })
        .catch((error) => {
          console.error("❌ Failed to initialize local stream:", error);
          showSystemMessage(
            "⚠️ Звонок создан, но нет доступа к камере/микрофону"
          );
        });
    }

    if (!localStream) {
      initializeLocalStream()
        .then(() => {
          console.log("✅ Local stream initialized for room creator");
        })
        .catch((error) => {
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

  function showRemoteVideo(sessionId, remoteStream) {
    const remoteVideoId = `remoteVideo_${sessionId}`;
    let remoteVideo = document.getElementById(remoteVideoId);
    let videoContainer = document.getElementById(`videoContainer_${sessionId}`);

    // ИСПРАВЛЕНИЕ: Проверяем, не существует ли уже контейнер
    if (!videoContainer) {
      videoContainer = document.createElement("div");
      videoContainer.className = "video-container";
      videoContainer.id = `videoContainer_${sessionId}`;

      remoteVideo = document.createElement("video");
      remoteVideo.id = remoteVideoId;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.className = "remote-video";
      remoteVideo.muted = true;

      // ИСПРАВЛЕНИЕ: Добавляем обработчики ошибок для видео
      remoteVideo.onerror = (e) => {
        console.error(`❌ Video error for ${sessionId}:`, e);
      };

      remoteVideo.onloadedmetadata = () => {
        console.log(`✅ Video loaded for ${sessionId}`);
        remoteVideo
          .play()
          .catch((e) => console.log(`⚠️ Auto-play prevented for ${sessionId}`));
      };

      const videoLabel = document.createElement("div");
      videoLabel.className = "video-label";

      const userName = roomUsers.get(sessionId)?.userName || "Участник";
      videoLabel.textContent = userName;

      videoContainer.appendChild(remoteVideo);
      videoContainer.appendChild(videoLabel);

      const videoGrid = document.querySelector(".video-grid");
      if (videoGrid) {
        videoGrid.appendChild(videoContainer);
      }
    }

    if (remoteVideo) {
      try {
        remoteVideo.srcObject = remoteStream;
        console.log(`✅ Remote video stream set for ${sessionId}`);
      } catch (error) {
        console.error(`❌ Error setting remote video for ${sessionId}:`, error);
      }
    }

    setTimeout(updateVideoGridLayout, 100);
  }

  async function createOffer(targetSessionId, attempt = 1) {
    console.log(
      `📤 Creating offer for: ${targetSessionId} (attempt ${attempt})`
    );

    if (offerInProgress.has(targetSessionId)) {
      console.log(`⏳ Offer already in progress for ${targetSessionId}`);
      return;
    }
    offerInProgress.add(targetSessionId);

    try {
      // Закрываем существующее соединение перед созданием нового
      const existingPc = peerConnections.get(targetSessionId);
      if (existingPc) {
        console.log(`🔄 Closing existing connection for ${targetSessionId}`);
        existingPc.close();
        peerConnections.delete(targetSessionId);
      }

      const pc = await createPeerConnection(targetSessionId);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);
      console.log(
        `✅ Local description set for ${targetSessionId}, state: ${pc.signalingState}`
      );

      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId,
        offer,
      });

      console.log(`✅ Offer sent to ${targetSessionId}`);
    } catch (error) {
      console.error("❌ Error creating offer:", error);

      // Очищаем проблемное соединение
      if (peerConnections.has(targetSessionId)) {
        peerConnections.get(targetSessionId).close();
        peerConnections.delete(targetSessionId);
      }

      // Повторяем попытку
      if (attempt < 3) {
        const delay = Math.min(2000 * attempt, 5000);
        console.log(
          `🔄 Retrying offer creation for ${targetSessionId} in ${delay}ms...`
        );
        setTimeout(() => createOffer(targetSessionId, attempt + 1), delay);
      }
    } finally {
      offerInProgress.delete(targetSessionId);
    }
  }

  // Автоматическое восстановление потерянных соединений
  // setInterval(() => {
  //   if (!isInCall || roomUsers.size <= 1) return;

  //   const otherUsers = Array.from(roomUsers.values()).filter(
  //     user => user.sessionId !== mySessionId
  //   );

  //   otherUsers.forEach(user => {
  //     const pc = peerConnections.get(user.sessionId);

  //     // Если пользователь в комнате, но нет активного соединения - восстанавливаем
  //     if (!pc || pc.connectionState === "disconnected" || pc.connectionState === "failed") {
  //       console.log(`🔄 Auto-reconnecting to ${user.userName} (state: ${pc?.connectionState})`);

  //       if (pc) {
  //         try { pc.close(); } catch (e) { }
  //         peerConnections.delete(user.sessionId);
  //       }

  //       // Ждем случайную задержку чтобы избежать конфликтов
  //       setTimeout(() => {
  //         if (roomUsers.has(user.sessionId)) {
  //           createOffer(user.sessionId);
  //         }
  //       }, Math.random() * 3000 + 1000);
  //     }
  //   });
  // }, 10000); // Проверка каждые 10 секунд

  function handleUserJoined(message) {
    console.log(`👤 User ${message.userName} joined the call`);

    if (!roomUsers.has(message.sessionId)) {
      roomUsers.set(message.sessionId, {
        userId: message.userId,
        userName: message.userName,
        sessionId: message.sessionId,
      });

      updateParticipantsCount(roomUsers.size);

      setTimeout(() => {
        debugConnectionsDetailed();
      }, 1000);

      if (isInCall && message.sessionId !== mySessionId) {
        const existingPc = peerConnections.get(message.sessionId);

        // Пропускаем если уже есть активное соединение
        if (
          existingPc &&
          (existingPc.connectionState === "connected" ||
            existingPc.signalingState === "have-local-offer")
        ) {
          console.log(
            `✅ Already processing connection with new user ${message.userName}`
          );
          return;
        }

        if (!peerConnections.has(message.sessionId)) {
          console.log(
            `🔄 Creating connection for new user: ${message.userName}`
          );
          setTimeout(() => {
            createOffer(message.sessionId);
          }, 2000);
        }
      }
    }
  }

  async function handleRoomUsers(message) {
    console.log("👥 Room users received:", message.users);

    roomUsers.clear();
    message.users.forEach((user) => {
      roomUsers.set(user.sessionId, user);
    });

    updateParticipantsCount(message.users.length);

    const otherUsers = message.users.filter(
      (user) => user.sessionId !== mySessionId
    );

    console.log(`🔗 Need to connect to ${otherUsers.length} other users`);

    // УВЕЛИЧЬТЕ ЗАДЕРЖКУ МЕЖДУ СОЕДИНЕНИЯМИ
    for (let i = 0; i < otherUsers.length; i++) {
      const user = otherUsers[i];

      await new Promise((resolve) => setTimeout(resolve, 2000 + i * 2000)); // 2-6 секунд

      console.log(`🔄 Setting up connection with: ${user.userName}`);
      try {
        await createOffer(user.sessionId);
      } catch (error) {
        console.error(`❌ Failed to create offer for ${user.userName}:`, error);
      }
    }
  }

  async function createPeerConnection(targetSessionId, configOverride) {
    console.log(`🔗 Creating peer connection for: ${targetSessionId}`);

    try {
      const pc = new RTCPeerConnection(configOverride || rtcConfig);
      pc.createdAt = Date.now();
      pc.pendingIceCandidates = [];

      // ПРОВЕРЯЕМ, были ли уже добавлены треки в это соединение
      let audioTracksAdded = false;
      let videoTracksAdded = false;

      // ГАРАНТИРУЕМ наличие локальных треков перед созданием предложения
      if (localStream) {
        // Явно добавляем все аудио треки (только если еще не добавлены)
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0 && !audioTracksAdded) {
          audioTracks.forEach((track) => {
            try {
              // ПРОВЕРЯЕМ, не был ли трек уже добавлен
              const existingSenders = pc.getSenders();
              const trackAlreadyAdded = existingSenders.some(
                (sender) => sender.track && sender.track.id === track.id
              );

              if (!trackAlreadyAdded) {
                console.log(`🎤 Adding audio track to ${targetSessionId}:`, {
                  enabled: track.enabled,
                  readyState: track.readyState,
                  kind: track.kind,
                });
                pc.addTrack(track, localStream);
              } else {
                console.log(
                  `🎤 Audio track already added to ${targetSessionId}`
                );
              }
            } catch (error) {
              console.error("Error adding audio track:", error);
            }
          });
          audioTracksAdded = true;
        } else if (audioTracks.length === 0) {
          console.warn("⚠️ No audio tracks available for local stream");
          // Создаем приемник для аудио если нет локального трека
          if (
            !pc.getReceivers().some((r) => r.track && r.track.kind === "audio")
          ) {
            pc.addTransceiver("audio", { direction: "recvonly" });
          }
        }

        // Добавляем видео треки если есть (только если еще не добавлены)
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0 && !videoTracksAdded) {
          videoTracks.forEach((track) => {
            try {
              // ПРОВЕРЯЕМ, не был ли трек уже добавлен
              const existingSenders = pc.getSenders();
              const trackAlreadyAdded = existingSenders.some(
                (sender) => sender.track && sender.track.id === track.id
              );

              if (!trackAlreadyAdded) {
                console.log(`🎥 Adding video track to ${targetSessionId}`);
                pc.addTrack(track, localStream);
              } else {
                console.log(
                  `🎥 Video track already added to ${targetSessionId}`
                );
              }
            } catch (error) {
              console.error("Error adding video track:", error);
            }
          });
          videoTracksAdded = true;
        } else if (videoTracks.length === 0) {
          // Создаем приемник для видео если нет локального трека
          if (
            !pc.getReceivers().some((r) => r.track && r.track.kind === "video")
          ) {
            pc.addTransceiver("video", { direction: "recvonly" });
          }
        }
      } else {
        console.warn(
          "⚠️ No local stream available, creating recvonly transceivers"
        );
        // Если нет локального потока, создаем приемники
        if (
          !pc.getReceivers().some((r) => r.track && r.track.kind === "audio")
        ) {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }
        if (
          !pc.getReceivers().some((r) => r.track && r.track.kind === "video")
        ) {
          pc.addTransceiver("video", { direction: "recvonly" });
        }
      }

      // Обработчик получения удаленных потоков
      pc.ontrack = (event) => {
        console.log("📹 Received remote track:", {
          kind: event.track.kind,
          readyState: event.track.readyState,
          streams: event.streams.length,
          sessionId: targetSessionId,
        });

        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];

          // Логируем детальную информацию о треках
          const audioTracks = remoteStream.getAudioTracks();
          const videoTracks = remoteStream.getVideoTracks();

          console.log("🔊 Remote stream analysis:", {
            audioTracks: audioTracks.length,
            videoTracks: videoTracks.length,
            audioTrackDetails: audioTracks.map((track) => ({
              enabled: track.enabled,
              readyState: track.readyState,
              muted: track.muted,
              kind: track.kind,
            })),
          });

          // ВАЖНО: Проверяем и логируем состояние аудио треков
          if (audioTracks.length > 0) {
            audioTracks.forEach((track, index) => {
              console.log(`🎵 Remote audio track ${index}:`, {
                enabled: track.enabled,
                readyState: track.readyState,
                muted: track.muted,
                id: track.id,
              });

              // Автоматически включаем аудио трек если он отключен
              if (!track.enabled) {
                console.log("🔊 Enabling disabled remote audio track");
                track.enabled = true;
              }
            });
          } else {
            console.warn("⚠️ No audio tracks in remote stream!");
          }

          showRemoteVideo(targetSessionId, remoteStream);

          // Автоматически включаем звук для удаленного видео
          setTimeout(() => {
            const remoteVideo = document.getElementById(
              `remoteVideo_${targetSessionId}`
            );
            if (remoteVideo) {
              remoteVideo.muted = false; // Включаем звук
              remoteVideo.volume = 1.0; // Устанавливаем максимальную громкость
              console.log("🔊 Unmuted remote video and set volume to 1.0");

              // Пытаемся воспроизвести
              remoteVideo.play().catch((e) => {
                console.log(
                  "⚠️ Auto-play prevented, user interaction required"
                );
              });
            }
          }, 1000);
        }
      };

      // Обработчик ICE кандидатов
      pc.onicecandidate = (event) => {
        if (event.candidate && currentRoomId) {
          console.log(`🧊 Sending ICE candidate to ${targetSessionId}`);
          sendMessage({
            type: "webrtc_ice_candidate",
            roomId: currentRoomId,
            targetSessionId: targetSessionId,
            candidate: event.candidate,
          });
        } else if (!event.candidate) {
          console.log(`✅ All ICE candidates gathered for ${targetSessionId}`);
        }
      };

      // Обработчики состояния соединения
      pc.onconnectionstatechange = () => {
        console.log(
          `🔗 Connection state for ${targetSessionId}: ${pc.connectionState}`
        );

        if (pc.connectionState === "connected") {
          console.log(`✅ Successfully connected to ${targetSessionId}`);
          updateCallStatus("connected");

          // Очищаем отложенные кандидаты при успешном соединении
          if (pc.pendingIceCandidates) {
            pc.pendingIceCandidates = [];
          }
        } else if (pc.connectionState === "disconnected") {
          console.warn(`⚠️ Connection disconnected with ${targetSessionId}`);
          scheduleIceRestart(targetSessionId, "connectionstate disconnected");
        } else if (pc.connectionState === "failed") {
          console.warn(`❌ Connection failed with ${targetSessionId}`);
          restartConnectionWithRelay(targetSessionId);
        } else if (pc.connectionState === "closed") {
          console.log(`🔒 Connection closed with ${targetSessionId}`);
        }
      };

      // Обработчик ICE соединения
      pc.oniceconnectionstatechange = () => {
        console.log(
          `🧊 ICE connection state for ${targetSessionId}: ${pc.iceConnectionState}`
        );

        if (pc.iceConnectionState === "connected") {
          console.log(`✅ ICE connected to ${targetSessionId}`);
        } else if (pc.iceConnectionState === "disconnected") {
          console.warn(`⚠️ ICE disconnected with ${targetSessionId}`);
          scheduleIceRestart(targetSessionId, "ice disconnected");
        } else if (pc.iceConnectionState === "failed") {
          console.warn(`❌ ICE failed with ${targetSessionId}`);
          restartConnectionWithRelay(targetSessionId);
        }
      };

      // Обработчик состояния сигналинга
      pc.onsignalingstatechange = () => {
        console.log(
          `📡 Signaling state for ${targetSessionId}: ${pc.signalingState}`
        );

        // Когда signaling state становится stable, обрабатываем отложенные кандидаты
        if (pc.signalingState === "stable" && pc.remoteDescription) {
          processPendingIceCandidates(pc, targetSessionId);
        }
      };

      peerConnections.set(targetSessionId, pc);
      return pc;
    } catch (error) {
      console.error(
        `❌ Error creating peer connection for ${targetSessionId}:`,
        error
      );
      throw error;
    }
  }

  function cleanupPendingCandidates(sessionId) {
    const pc = peerConnections.get(sessionId);
    if (pc && pc.pendingIceCandidates) {
      console.log(
        `🧹 Cleaning up ${pc.pendingIceCandidates.length} pending ICE candidates for ${sessionId}`
      );
      pc.pendingIceCandidates = [];
    }
  }

  function debugConnections() {
    console.log("🔍 DEBUG CONNECTIONS:");
    console.log(`Room Users: ${roomUsers.size}`);
    roomUsers.forEach((user, sessionId) => {
      console.log(
        `- ${user.userName} (${sessionId}) ${
          sessionId === mySessionId ? "(You)" : ""
        }`
      );
    });

    console.log(`Peer Connections: ${peerConnections.size}`);
    peerConnections.forEach((pc, sessionId) => {
      console.log(
        `- ${sessionId}: ${pc.connectionState} (ICE: ${pc.iceConnectionState})`
      );
    });

    console.log(
      `Video Elements: ${document.querySelectorAll(".video-container").length}`
    );
  }

  // Вызывайте эту функцию для отладки при необходимости

  function updateVideoGridLayout() {
    const videoGrid = document.querySelector(".video-grid");
    if (!videoGrid) return;
    const count = videoGrid.querySelectorAll(".video-container").length;
    if (count <= 1) {
      videoGrid.style.gridTemplateColumns = "1fr";
    } else if (count === 2) {
      videoGrid.style.gridTemplateColumns = "1fr 1fr";
    } else if (count <= 4) {
      videoGrid.style.gridTemplateColumns = "1fr 1fr";
    } else {
      videoGrid.style.gridTemplateColumns = "1fr 1fr 1fr";
    }
  }

  function scheduleIceRestart(sessionId, reason) {
    if (!currentRoomId) return;
    if (iceRestartTimers.get(sessionId)) return;
    const now = Date.now();
    const last = lastIceRestartAt.get(sessionId) || 0;
    if (now - last < 8000) {
      console.log(`🕓 ICE restart throttled for ${sessionId}`);
      return;
    }
    const timer = setTimeout(() => {
      iceRestartTimers.delete(sessionId);
      restartIce(sessionId, reason);
    }, 3000);
    iceRestartTimers.set(sessionId, timer);
  }

  async function restartIce(sessionId, reason) {
    try {
      const pc = peerConnections.get(sessionId);
      if (!pc || pc.signalingState === "closed") return;
      if (pc.signalingState !== "stable") {
        console.log(
          `⏳ Skip ICE restart for ${sessionId}, signaling not stable: ${pc.signalingState}`
        );
        return;
      }
      lastIceRestartAt.set(sessionId, Date.now());
      console.log(
        `🔁 Restarting ICE with ${sessionId} (${reason || "unknown"})`
      );
      const offer = await pc.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId: sessionId,
        offer,
      });
    } catch (e) {
      console.warn("⚠️ ICE restart failed, falling back to full restart:", e);
      restartConnection(sessionId);
    }
  }

  function restartConnection(sessionId) {
    try {
      const pc = peerConnections.get(sessionId);
      if (pc) {
        try {
          pc.close();
        } catch (e) {}
        peerConnections.delete(sessionId);
      }
      if (currentRoomId) {
        createOffer(sessionId);
      }
    } catch (e) {
      console.warn("⚠️ Failed to restart connection:", e);
    }
  }

  async function createOfferWithConfig(targetSessionId, config) {
    console.log(`📤 Creating offer (config override) for: ${targetSessionId}`);

    if (offerInProgress.has(targetSessionId)) {
      console.log(`⏳ Offer already in progress for ${targetSessionId}`);
      return;
    }
    offerInProgress.add(targetSessionId);

    try {
      const existingPc = peerConnections.get(targetSessionId);
      if (existingPc) {
        if (existingPc.signalingState === "have-local-offer") return;
        if (
          existingPc.signalingState === "stable" ||
          existingPc.connectionState === "connected"
        )
          return;
        try {
          existingPc.close();
        } catch (_) {}
        peerConnections.delete(targetSessionId);
      }

      const pc = await createPeerConnection(targetSessionId, config);
      await new Promise((r) => setTimeout(r, 300));
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      sendMessage({
        type: "webrtc_offer",
        roomId: currentRoomId,
        targetSessionId,
        offer,
      });
    } catch (e) {
      console.error("❌ Error creating offer with config:", e);
    } finally {
      offerInProgress.delete(targetSessionId);
    }
  }

  function restartConnectionWithRelay(sessionId) {
    try {
      const pc = peerConnections.get(sessionId);
      if (pc) {
        try {
          pc.close();
        } catch (e) {}
        peerConnections.delete(sessionId);
      }
      if (currentRoomId) {
        console.log(`🛰️ Fallback to TURN-only for ${sessionId}`);
        createOfferWithConfig(sessionId, rtcConfigRelay);
      }
    } catch (e) {
      console.warn("⚠️ Failed to restart (relay) connection:", e);
    }
  }

  function refreshAllConnections() {
    console.log("🔄 Refreshing all peer connections...");

    const disconnectedConnections = Array.from(
      peerConnections.entries()
    ).filter(
      ([sessionId, pc]) =>
        pc.connectionState !== "connected" &&
        pc.connectionState !== "connecting"
    );

    // Обновляем только отключенные соединения с задержкой
    disconnectedConnections.forEach(async ([sessionId], index) => {
      await new Promise((resolve) => setTimeout(resolve, index * 2000)); // 2 секунды между каждым
      if (currentRoomId && peerConnections.has(sessionId)) {
        createOffer(sessionId);
      }
    });
  }

  // Увеличьте интервал проверки соединений
  // setInterval(() => {
  //   if (isInCall && peerConnections.size > 0) {
  //     let disconnectedCount = 0;
  //     peerConnections.forEach((pc, sessionId) => {
  //       if (
  //         pc.connectionState !== "connected" &&
  //         pc.connectionState !== "connecting"
  //       ) {
  //         disconnectedCount++;
  //         console.log(
  //           `⚠️ Connection with ${sessionId} is ${pc.connectionState}`
  //         );
  //       }
  //     });

  //     if (disconnectedCount > 0 && disconnectedCount <= 4) {
  //       // Ограничиваем количество одновременных переподключений
  //       console.log(`🔄 ${disconnectedCount} connections need refresh`);
  //       refreshAllConnections();
  //     }
  //   }
  // }, 30000); // Увеличиваем до 30 секунд

  async function handleWebRTCOffer(message) {
    try {
      console.log(`📥 Received WebRTC offer from: ${message.fromSessionId}`);

      // УДАЛИТЕ ВСЮ ЛОГИКУ КОНФЛИКТА - ПРОСТО ПРИНИМАЕМ ОФФЕР
      let pc = peerConnections.get(message.fromSessionId);

      // Если PeerConnection уже существует и работает - используем его
      if (
        pc &&
        (pc.connectionState === "connected" || pc.signalingState === "stable")
      ) {
        console.log(
          `✅ Already connected to ${message.fromSessionId}, reusing connection`
        );
      }
      // Если PeerConnection в плохом состоянии - пересоздаем
      else if (
        pc &&
        (pc.signalingState === "closed" || pc.connectionState === "failed")
      ) {
        console.log(
          `🔄 Replacing failed connection with ${message.fromSessionId}`
        );
        pc.close();
        peerConnections.delete(message.fromSessionId);
        pc = null;
      }

      // Создаем новое соединение если нужно
      if (!pc) {
        pc = await createPeerConnection(message.fromSessionId);
      }

      // Устанавливаем удаленное описание
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      console.log(`✅ Remote description set, state: ${pc.signalingState}`);

      // Обрабатываем отложенные ICE кандидаты
      await processPendingIceCandidates(pc, message.fromSessionId);

      // Создаем и отправляем ответ
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendMessage({
        type: "webrtc_answer",
        roomId: message.roomId,
        targetSessionId: message.fromSessionId,
        answer: answer,
      });

      console.log(`✅ Answer created and sent to ${message.fromSessionId}`);
    } catch (error) {
      console.error("❌ Error handling WebRTC offer:", error);

      // При ошибке пересоздаем соединение
      if (message.fromSessionId && peerConnections.has(message.fromSessionId)) {
        const pc = peerConnections.get(message.fromSessionId);
        if (
          pc.signalingState === "have-local-offer" ||
          pc.connectionState === "failed"
        ) {
          pc.close();
          peerConnections.delete(message.fromSessionId);

          // Пытаемся создать новое предложение через 2 секунды
          setTimeout(() => {
            if (currentRoomId && roomUsers.has(message.fromSessionId)) {
              createOffer(message.fromSessionId);
            }
          }, 2000);
        }
      }
    }
  }

  async function handleWebRTCAnswer(message) {
    try {
      console.log(`📥 Received WebRTC answer from: ${message.fromSessionId}`);

      debugConnectionsDetailed();
      const pc = peerConnections.get(message.fromSessionId);
      if (!pc) {
        console.warn(
          `❌ No peer connection found for ${message.fromSessionId}`
        );
        return;
      }

      console.log(`📡 Current signaling state: ${pc.signalingState}`);

      if (pc.signalingState === "stable") {
        console.log(
          `✅ Connection already stable with ${message.fromSessionId}, ignoring duplicate answer`
        );
        return;
      }

      if (pc.signalingState !== "have-local-offer") {
        console.warn(
          `⚠️ Wrong signaling state for answer: ${pc.signalingState}, expected have-local-offer`
        );

        // Если соединение в плохом состоянии, пересоздаем его
        if (pc.signalingState === "closed" || pc.connectionState === "failed") {
          console.log(`🔄 Recreating connection with ${message.fromSessionId}`);
          peerConnections.delete(message.fromSessionId);
          setTimeout(() => createOffer(message.fromSessionId), 1000);
        }
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
      console.log(
        `✅ Remote description set for ${message.fromSessionId}, signaling state: ${pc.signalingState}`
      );

      await processPendingIceCandidates(pc, message.fromSessionId);
    } catch (error) {
      console.error("❌ Error handling WebRTC answer:", error);

      // Более детальная обработка ошибок
      if (error.toString().includes("wrong state: stable")) {
        console.log(
          `✅ Answer already processed for ${message.fromSessionId}, connection is stable`
        );
        return;
      }

      if (
        error.toString().includes("closed") ||
        error.toString().includes("failed")
      ) {
        console.log(
          `🔄 Connection with ${message.fromSessionId} is closed/failed, will recreate`
        );
        if (peerConnections.has(message.fromSessionId)) {
          peerConnections.get(message.fromSessionId).close();
          peerConnections.delete(message.fromSessionId);
        }
        setTimeout(() => createOffer(message.fromSessionId), 2000);
      }
    }
  }

  async function handleICECandidate(message) {
    try {
      const pc = peerConnections.get(message.fromSessionId);
      if (!pc) {
        console.warn(
          `❌ No peer connection for ICE candidate from ${message.fromSessionId}`
        );
        return;
      }

      if (pc.signalingState === "closed" || pc.connectionState === "closed") {
        console.warn(
          `⚠️ Connection closed for ${message.fromSessionId}, ignoring ICE candidate`
        );
        return;
      }

      // Если remote description еще не установлен, сохраняем кандидата в очередь
      if (!pc.remoteDescription) {
        console.log(
          `⏳ Queueing ICE candidate - waiting for remote description from ${message.fromSessionId}`
        );

        if (!pc.pendingIceCandidates) {
          pc.pendingIceCandidates = [];
        }
        pc.pendingIceCandidates.push(new RTCIceCandidate(message.candidate));
        return;
      }

      // Пытаемся добавить кандидат
      await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      console.log(`🧊 ICE candidate added from ${message.fromSessionId}`);
    } catch (error) {
      console.error("❌ Error handling ICE candidate:", error);
      // Не критичная ошибка - продолжаем работу
    }
  }

  function handleUserLeft(message) {
    console.log(`👤 User ${message.userName} left the call`);

    roomUsers.delete(message.sessionId);

    // НЕ УДАЛЯТЬ PeerConnection СРАЗУ - дать время для восстановления
    if (peerConnections.has(message.sessionId)) {
      const pc = peerConnections.get(message.sessionId);

      // Удаляем только если соединение окончательно разорвано
      if (pc.connectionState === "closed" || pc.connectionState === "failed") {
        pc.close();
        peerConnections.delete(message.sessionId);
        console.log(`🗑️ Removed peer connection for ${message.userName}`);
      } else {
        console.log(
          `⏳ Keeping peer connection for ${message.userName} (state: ${pc.connectionState})`
        );
        // Установим таймер для окончательного удаления через 30 секунд
        setTimeout(() => {
          if (peerConnections.has(message.sessionId)) {
            peerConnections.get(message.sessionId).close();
            peerConnections.delete(message.sessionId);
            console.log(
              `🗑️ Final removal of peer connection for ${message.userName}`
            );
          }
        }, 30000);
      }
    }

    removeVideoElement(message.sessionId);
    updateParticipantsCount(roomUsers.size);

    showSystemMessage(`👤 ${message.userName} покинул звонок`);

    // ДОБАВИТЬ: автоматическое обновление комнаты
    setTimeout(() => {
      updateRoomUsers();
    }, 2000);
  }

  function removeVideoElement(sessionId) {
    const videoContainer = document.getElementById(
      `videoContainer_${sessionId}`
    );
    if (videoContainer) {
      videoContainer.remove();
      // Обновляем компоновку сетки после удаления
      setTimeout(updateVideoGridLayout, 100);
    }
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
        failed: "❌ Ошибка соединения",
        closed: "🔌 Соединение закрыто",
      };
      callStatusEl.textContent = statusMap[state] || state;
    }
  }

  function debugRoomUsers() {
    console.log("🔍 DEBUG Room Users:");
    console.log(`Total in room: ${roomUsers.size}`);
    roomUsers.forEach((user, sessionId) => {
      console.log(
        `- ${user.userName} (${sessionId}) ${
          sessionId === mySessionId ? "(You)" : ""
        }`
      );
    });

    console.log("🔍 DEBUG Peer Connections:");
    console.log(`Total peer connections: ${peerConnections.size}`);
    peerConnections.forEach((pc, sessionId) => {
      console.log(`- ${sessionId}: ${pc.connectionState}`);
    });

    console.log("🔍 DEBUG Video Elements:");
    const videoContainers = document.querySelectorAll(".video-container");
    console.log(`Total video containers: ${videoContainers.length}`);
  }

  // Вызывайте эту функцию для отладки:
  // debugRoomUsers();

  function updateParticipantsCount(count) {
    participantsCount = count;
    if (participantsCountEl) {
      participantsCountEl.textContent = `Участников: ${count}`;
      // Добавляем визуальную индикацию если участников больше 2
      if (count > 2) {
        participantsCountEl.style.color = "#fbbf24";
        participantsCountEl.style.fontWeight = "bold";
      } else {
        participantsCountEl.style.color = "";
        participantsCountEl.style.fontWeight = "";
      }

      if (count > 1) {
        console.log(`👥 Participants count updated: ${count}`);
        debugConnectionsDetailed();
      }
    }

    // Логируем для отладки
    console.log(`👥 Participants count updated: ${count}`);
    debugRoomUsers();
  }

  // UI управления звонком
  function showVideoCallUI() {
    videoCallContainer.classList.remove("hidden");
    updateCallButtons();
    updateParticipantsCount(1);
  }

  function hideVideoCallUI() {
    videoCallContainer.classList.add("hidden");
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
        toggleVideoBtn.style.background = videoTrack.enabled ? "" : "#ff6b6b";
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
        toggleAudioBtn.style.background = audioTrack.enabled ? "" : "#ff6b6b";
        showSystemMessage(
          audioTrack.enabled ? "✅ Микрофон включен" : "❌ Микрофон выключен"
        );
      }
    }
  }

  function endCall() {
    console.log("📞 Ending call...");

    if (currentRoomId) {
      sendMessage({ type: "leave_room", roomId: currentRoomId });
      sendMessage({ type: "end_call", roomId: currentRoomId });
    }

    peerConnections.forEach((pc, sessionId) => {
      pc.close();
      removeVideoElement(sessionId);
    });

    peerConnections.clear();

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    currentRoomId = null;
    isInCall = false;
    isCallInitiator = false;
    roomUsers.clear();
    incomingCall = null;

    document
      .querySelectorAll(".video-container:not(#videoContainer_local)")
      .forEach((container) => {
        container.remove();
      });

    if (localVideo) {
      localVideo.srcObject = null;
    }

    hideVideoCallUI();
    hideIncomingCallModal();
    updateCallButtons();
    showSystemMessage("📞 Звонок завершен");

    setTimeout(() => {
      if (isConnected) {
        sendMessage({ type: "get_active_calls" });
      }
    }, 1000);
  }

  function showBrowserNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body: body,
        icon: "/favicon.ico",
      });
    }
  }

  // Глобальные функции
  window.downloadFile = function (filename, filetype, base64Data) {
    const link = document.createElement("a");
    link.href = `data:${filetype};base64,${base64Data}`;
    link.download = filename;
    link.click();
  };

  // Запрос разрешения на уведомления
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // Обработка закрытия страницы
  window.addEventListener("beforeunload", () => {
    if (ws) {
      ws.close(1000, "Page closed");
    }
    endCall();
  });

  // Автоматический мониторинг соединений
  setInterval(() => {
    if (!isInCall || roomUsers.size <= 1) return;

    let disconnectedCount = 0;
    const otherUsers = Array.from(roomUsers.values()).filter(
      (user) => user.sessionId !== mySessionId
    );

    otherUsers.forEach((user) => {
      const pc = peerConnections.get(user.sessionId);

      if (
        !pc ||
        pc.connectionState !== "connected" ||
        pc.iceConnectionState !== "connected"
      ) {
        disconnectedCount++;
        console.log(`⚠️ Connection issue with ${user.userName}:`, {
          connectionState: pc?.connectionState,
          iceState: pc?.iceConnectionState,
          signalingState: pc?.signalingState,
        });
      }
    });

    // Если больше половины соединений имеют проблемы
    if (
      disconnectedCount > 0 &&
      disconnectedCount >= Math.ceil(otherUsers.length / 2)
    ) {
      console.log(
        `🔄 Auto-refreshing ${disconnectedCount} problematic connections`
      );
      refreshAllConnections();
    }
  }, 15000); // Проверка каждые 15 секунд

  function refreshAllConnections() {
    if (!isInCall) return;

    console.log("🔄 Manually refreshing all connections...");

    const otherUsers = Array.from(roomUsers.values()).filter(
      (user) => user.sessionId !== mySessionId
    );

    otherUsers.forEach((user, index) => {
      setTimeout(() => {
        const existingPc = peerConnections.get(user.sessionId);

        // Пересоздаем соединение только если оно не активно
        if (
          !existingPc ||
          existingPc.connectionState !== "connected" ||
          existingPc.iceConnectionState !== "connected"
        ) {
          console.log(`🔄 Refreshing connection with ${user.userName}`);
          if (existingPc) {
            try {
              existingPc.close();
            } catch (e) {}
            peerConnections.delete(user.sessionId);
          }
          createOffer(user.sessionId);
        }
      }, index * 3000); // 3 секунды между каждым
    });
  }

  // Глобальные функции для HTML onclick
  window.toggleSidebar = function () {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.querySelector(".overlay");

    if (sidebar && overlay) {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    }
  };

  window.toggleEmojiPanel = function () {
    const emojiPanel = document.getElementById("emojiPanel");
    if (emojiPanel) {
      emojiPanel.style.display =
        emojiPanel.style.display === "none" ? "flex" : "none";
    }
  };

  window.toggleVoiceRecord = async function () {
    try {
      // Сначала проверяем доступ
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stream) {
        // Если доступ есть, начинаем запись
        if (window.startVoiceRecording) {
          window.startVoiceRecording();
        }
      } else {
        showSystemMessage("❌ Не удалось получить доступ к микрофону");
      }
    } catch (error) {
      showSystemMessage("❌ Ошибка доступа к микрофону");
    }
  };

  window.uploadFile = function () {
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
      fileInput.click();
    }
  };

  window.startVideoCall = function () {
    if (window.startGroupCall) {
      window.startGroupCall();
    }
  };

  window.endVideoCall = function () {
    if (window.endCall) {
      window.endCall();
    }
  };

  window.acceptVideoCall = function () {
    if (window.acceptCall) {
      window.acceptCall();
    }
  };

  window.rejectVideoCall = function () {
    if (window.rejectCall) {
      window.rejectCall();
    }
  };

  window.toggleVideo = function () {
    if (window.toggleVideo) {
      window.toggleVideo();
    }
  };

  window.toggleAudio = function () {
    if (window.toggleAudio) {
      window.toggleAudio();
    }
  };

  window.toggleScreenShare = function () {
    // Функция для демонстрации экрана (можно реализовать позже)
    showSystemMessage("🖥️ Демонстрация экрана пока не реализована");
  };

  window.stopVoiceRecording = function () {
    if (window.stopVoiceRecording) {
      window.stopVoiceRecording();
    }
  };

  window.cancelVoiceRecording = function () {
    if (window.cancelVoiceRecording) {
      window.cancelVoiceRecording();
    }
  };

  // Инициализация при загрузке
  window.addEventListener("DOMContentLoaded", () => {
    setVH();
    init();
  });
})();
