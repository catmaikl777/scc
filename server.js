"use strict";
// server.js - чат с локальными утилитами v2.0
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const WebSocket = require("ws");
const { Pool } = require("pg");

// Локальные утилиты
const LocalCache = require('./utils/cache');
const FileUtils = require('./utils/fileUtils');
const BackupManager = require('./utils/backup');
const ChatStats = require('./utils/stats');
const logger = require('./utils/logger');
const NotificationManager = require('./utils/notifications');
const TaskScheduler = require('./utils/scheduler');
const PerformanceMonitor = require('./utils/performance');
const SecurityManager = require('./utils/security');
const Analytics = require('./utils/analytics');
const ReportGenerator = require('./utils/reports');
const IPUtils = require('./utils/ipUtils');


// Настройка подключения к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Инициализация утилит
const cache = new LocalCache();
const backupManager = new BackupManager(pool);
const chatStats = new ChatStats(pool);
const notifications = new NotificationManager();
const scheduler = new TaskScheduler();
const performance = new PerformanceMonitor();
const security = new SecurityManager();
const analytics = new Analytics();
const reports = new ReportGenerator(analytics, chatStats, performance, security);

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
});



// Функции для работы с базой данных
const db = {
  async init() {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_temporary BOOLEAN DEFAULT false,
          avatar_url TEXT,
          bio TEXT,
          status VARCHAR(140)
        )
      `);

      try {
        await client.query(
          "ALTER TABLE users ADD COLUMN is_temporary BOOLEAN DEFAULT false"
        );
        console.log("✅ Added is_temporary column to users table");
      } catch (error) {
        if (error.code !== "42701") {
          // 42701 = column already exists
          throw error;
        }
        console.log("✅ is_temporary column already exists");
      }



      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          session_id VARCHAR(100) UNIQUE NOT NULL,
          connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          disconnected_at TIMESTAMP NULL
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          message_type VARCHAR(20) NOT NULL,
          content TEXT,
          target_user_id INTEGER REFERENCES users(id),
          file_name VARCHAR(255),
          file_type VARCHAR(100),
          file_size INTEGER,
          file_data BYTEA,
          voice_duration INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`
      );

      // Игры в чате
      await client.query(`
        CREATE TABLE IF NOT EXISTS games (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          data JSONB,
          status VARCHAR(20) DEFAULT 'waiting',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS game_participants (
          game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          score INTEGER DEFAULT 0,
          data JSONB,
          PRIMARY KEY (game_id, user_id)
        )
      `);

      // Система уровней
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_levels (
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
          level INTEGER DEFAULT 1,
          experience INTEGER DEFAULT 0,
          messages_count INTEGER DEFAULT 0,
          games_won INTEGER DEFAULT 0,
          achievements JSONB DEFAULT '[]'
        )
      `);

      // Стикеры и мемы
      await client.query(`
        CREATE TABLE IF NOT EXISTS stickers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          emoji VARCHAR(10) NOT NULL,
          category VARCHAR(50) DEFAULT 'general',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Приватные комнаты
      await client.query(`
        CREATE TABLE IF NOT EXISTS private_rooms (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          password_hash VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Система друзей
      await client.query(`
        CREATE TABLE IF NOT EXISTS friendships (
          id SERIAL PRIMARY KEY,
          user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user1_id, user2_id)
        )
      `);

      // Турниры
      await client.query(`
        CREATE TABLE IF NOT EXISTS tournaments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          game_type VARCHAR(50) NOT NULL,
          creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          max_players INTEGER DEFAULT 8,
          status VARCHAR(20) DEFAULT 'waiting',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS tournament_participants (
          tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (tournament_id, user_id)
        )
      `);

      // Опросы и голосования
      await client.query(`
        CREATE TABLE IF NOT EXISTS polls (
          id SERIAL PRIMARY KEY,
          creator_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          question TEXT NOT NULL,
          options JSONB NOT NULL,
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS poll_votes (
          poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          option_index INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (poll_id, user_id)
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id)`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`
      );

      await this.ensureFileColumns(client);
      await this.initializeStickers(client);
      console.log("✅ Database tables initialized successfully");
    } catch (error) {
      console.error("❌ Error initializing database:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async ensureFileColumns(client) {
    try {
      const columns = [
        "file_name",
        "file_type",
        "file_size",
        "file_data",
        "voice_duration",
      ];
      for (const column of columns) {
        try {
          await client.query(`SELECT ${column} FROM messages LIMIT 1`);
        } catch (error) {
          if (error.code === "42703") {
            console.log(`Adding ${column} column to messages table...`);
            const type =
              column === "file_size" || column === "voice_duration"
                ? "INTEGER"
                : column === "file_data"
                ? "BYTEA"
                : "VARCHAR(255)";
            await client.query(
              `ALTER TABLE messages ADD COLUMN ${column} ${type}`
            );
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error("Error ensuring file columns:", error);
      throw error;
    }
  },

  // ИСПРАВЛЕНИЕ: Более безопасная очистка дублирующихся сессий
  async cleanupDuplicateSessions(userId, currentSessionId) {
    const client = await pool.connect();
    try {
      // Получаем все активные сессии пользователя
      const result = await client.query(
        "SELECT session_id FROM user_sessions WHERE user_id = $1 AND session_id != $2 AND disconnected_at IS NULL",
        [userId, currentSessionId]
      );

      const duplicateSessions = result.rows.map((row) => row.session_id);

      if (duplicateSessions.length > 0) {
        console.log(
          `🧹 Found ${duplicateSessions.length} duplicate sessions for user ${userId}:`,
          duplicateSessions
        );

        // Закрываем дублирующиеся сессии в базе данных
        await client.query(
          "UPDATE user_sessions SET disconnected_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND session_id != $2 AND disconnected_at IS NULL",
          [userId, currentSessionId]
        );

        // Закрываем дублирующиеся соединения в памяти
        duplicateSessions.forEach((sessionId) => {
          if (clients.has(sessionId)) {
            const clientData = clients.get(sessionId);
            try {
              if (clientData.ws.readyState === WebSocket.OPEN) {
                // ИСПРАВЛЕНИЕ: Используем специальный код для дублирующих сессий
                clientData.ws.close(
                  4000,
                  "Duplicate session closed by new connection"
                );
              }
            } catch (error) {
              console.error("Error closing duplicate session:", error);
            }
            clients.delete(sessionId);
          }
        });
      }

      return duplicateSessions.length;
    } catch (error) {
      console.error("Error in cleanupDuplicateSessions:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async findOrCreateUser(username) {
    const client = await pool.connect();
    try {
      let result = await client.query(
        "SELECT id, username, is_temporary FROM users WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        // Создаем временного пользователя
        const isTemporary = /^User_/.test(username);
        result = await client.query(
          "INSERT INTO users (username, is_temporary) VALUES ($1, $2) RETURNING id, username, is_temporary",
          [username, isTemporary]
        );
      }

      await client.query(
        "UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1",
        [result.rows[0].id]
      );

      return result.rows[0];
    } catch (error) {
      console.error("Error in findOrCreateUser:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async createUserSession(userId, sessionId) {
    const client = await pool.connect();
    try {
      // Сначала создаем сессию, потом очищаем дубликаты
      const result = await client.query(
        "INSERT INTO user_sessions (user_id, session_id) VALUES ($1, $2) RETURNING id",
        [userId, sessionId]
      );

      // Очищаем дублирующиеся сессии после создания новой
      await this.cleanupDuplicateSessions(userId, sessionId);

      return result.rows[0];
    } catch (error) {
      console.error("Error in createUserSession:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async endUserSession(sessionId) {
    const client = await pool.connect();
    try {
      await client.query(
        "UPDATE user_sessions SET disconnected_at = CURRENT_TIMESTAMP WHERE session_id = $1",
        [sessionId]
      );
    } catch (error) {
      console.error("Error in endUserSession:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async saveMessage(
    userId,
    messageType,
    content,
    targetUserId = null,
    fileData = null
  ) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO messages (user_id, message_type, content, target_user_id, file_data) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
        [userId, messageType, content, targetUserId, fileData]
      );
      
      // Добавляем опыт за сообщение
      if (messageType === 'message') {
        await this.addExperience(userId, 1, client);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error("Error in saveMessage:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async addExperience(userId, exp, client = null) {
    const shouldRelease = !client;
    if (!client) client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO user_levels (user_id, experience, messages_count) 
         VALUES ($1, $2, 1) 
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           experience = user_levels.experience + $2,
           messages_count = user_levels.messages_count + 1`,
        [userId, exp]
      );
      
      // Проверяем повышение уровня
      const result = await client.query(
        'SELECT level, experience FROM user_levels WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows[0]) {
        const { level, experience } = result.rows[0];
        const newLevel = Math.floor(experience / 100) + 1;
        
        if (newLevel > level) {
          await client.query(
            'UPDATE user_levels SET level = $1 WHERE user_id = $2',
            [newLevel, userId]
          );
          return { levelUp: true, newLevel };
        }
      }
      
      return { levelUp: false };
    } catch (error) {
      console.error('Error adding experience:', error);
      return { levelUp: false };
    } finally {
      if (shouldRelease) client.release();
    }
  },

  async initializeStickers(client) {
    const stickers = [
      { name: 'Кот', emoji: '🐱', category: 'animals' },
      { name: 'Собака', emoji: '🐶', category: 'animals' },
      { name: 'Сердце', emoji: '❤️', category: 'emotions' },
      { name: 'Огонь', emoji: '🔥', category: 'reactions' },
      { name: 'Ракета', emoji: '🚀', category: 'space' },
      { name: 'Звезда', emoji: '⭐', category: 'space' },
      { name: 'Смех', emoji: '😂', category: 'emotions' },
      { name: 'Круто', emoji: '😎', category: 'emotions' },
      { name: 'Думаю', emoji: '🤔', category: 'emotions' },
      { name: 'Праздник', emoji: '🎉', category: 'reactions' }
    ];
    
    for (const sticker of stickers) {
      await client.query(
        'INSERT INTO stickers (name, emoji, category) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [sticker.name, sticker.emoji, sticker.category]
      );
    }
  },

  async getPollVotes(pollId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT option_index, COUNT(*) as votes FROM poll_votes WHERE poll_id = $1 GROUP BY option_index ORDER BY option_index',
        [pollId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  },

  async saveFileMessage(
    userId,
    filename,
    filetype,
    size,
    data,
    targetUserId = null,
    voiceDuration = null
  ) {
    const client = await pool.connect();
    try {
      await this.ensureFileColumns(client);
      const buffer = Buffer.from(data, "base64");

      const result = await client.query(
        `INSERT INTO messages (user_id, message_type, content, file_name, file_type, file_size, file_data, target_user_id, voice_duration) 
         VALUES ($1, 'file', $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
        [
          userId,
          filename,
          filename,
          filetype,
          size,
          buffer,
          targetUserId,
          voiceDuration,
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error("Error in saveFileMessage:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getMessageHistory(limit = 100) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT m.id, m.message_type as type, m.content, m.created_at, 
                u.username as name, u.id as user_id, m.target_user_id,
                m.file_name, m.file_type, m.file_size, m.voice_duration
         FROM messages m 
         JOIN users u ON m.user_id = u.id
         WHERE (m.message_type != 'private' OR m.target_user_id IS NULL)
         ORDER BY m.created_at DESC LIMIT $1`,
        [limit]
      );

      return result.rows.reverse().map((row) => {
        const message = {
          type: row.type,
          name: row.name,
          user_id: row.user_id,
          created_at: row.created_at,
          content: row.content,
        };

        if (row.type === "file") {
          message.file_name = row.file_name;
          message.file_type = row.file_type;
          message.file_size = row.file_size;
          message.voice_duration = row.voice_duration;
        }

        return message;
      });
    } catch (error) {
      console.error("Error in getMessageHistory:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getOnlineUsers() {
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT DISTINCT u.id, u.username 
        FROM users u
        JOIN user_sessions us ON u.id = us.user_id
        WHERE us.disconnected_at IS NULL 
        ORDER BY u.username
      `);

      // Дополнительная проверка: фильтруем пользователей, которые действительно онлайн в памяти
      const onlineUsers = result.rows.filter((user) => {
        return Array.from(clients.values()).some(
          (client) =>
            client.userId === user.id && client.ws.readyState === WebSocket.OPEN
        );
      });

      return onlineUsers;
    } catch (error) {
      console.error("Error in getOnlineUsers:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getUserById(userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT id, username FROM users WHERE id = $1",
        [userId]
      );
      return result.rows[0];
    } catch (error) {
      console.error("Error in getUserById:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  async isUsernameAvailable(userId, newUsername) {
    const client = await pool.connect();
    try {
      // Получаем текущего пользователя
      const currentUser = await client.query(
        "SELECT username FROM users WHERE id = $1",
        [userId]
      );

      // Если имя не изменилось, то оно доступно
      if (
        currentUser.rows.length > 0 &&
        currentUser.rows[0].username === newUsername
      ) {
        return true;
      }

      // Проверяем, занято ли имя другими пользователями
      const result = await client.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [newUsername, userId]
      );
      return result.rows.length === 0;
    } catch (error) {
      console.error("Error in isUsernameAvailable:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Удаляем временного пользователя если у него нет активных сессий
  async deleteTemporaryUserIfUnused(userId) {
    const client = await pool.connect();
    try {
      // Проверяем существование колонки
      const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='is_temporary'
    `);

      if (columnCheck.rows.length === 0) {
        return false;
      }

      const userRes = await client.query(
        "SELECT username, is_temporary FROM users WHERE id = $1",
        [userId]
      );

      if (userRes.rows.length === 0) return false;
      const username = userRes.rows[0].username;
      const isTemporary = userRes.rows[0].is_temporary;

      // Удаляем только временных пользователей
      if (!isTemporary) return false;

      const sessionsRes = await client.query(
        "SELECT COUNT(*)::int AS cnt FROM user_sessions WHERE user_id = $1 AND disconnected_at IS NULL",
        [userId]
      );

      const activeCount = sessionsRes.rows[0]
        ? parseInt(sessionsRes.rows[0].cnt, 10)
        : 0;
      if (activeCount === 0) {
        // Удаляем связанные записи
        await client.query("DELETE FROM user_fcm_tokens WHERE user_id = $1", [
          userId,
        ]);
        await client.query("DELETE FROM messages WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM user_sessions WHERE user_id = $1", [
          userId,
        ]);
        await client.query("DELETE FROM users WHERE id = $1", [userId]);

        console.log(`🗑️ Deleted temporary user ${username} (${userId})`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error in deleteTemporaryUserIfUnused:", error);
      return false;
    } finally {
      client.release();
    }
  },

  // НОВАЯ ФУНКЦИЯ: Очистка всех неиспользуемых временных пользователей
  async cleanupAllUnusedTemporaryUsers() {
    const client = await pool.connect();
    try {
      // Сначала проверяем существование колонки
      const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='is_temporary'
    `);

      if (columnCheck.rows.length === 0) {
        console.log("⚠️ is_temporary column doesn't exist, skipping cleanup");
        return [];
      }

      const result = await client.query(`
      SELECT u.id, u.username 
      FROM users u
      WHERE u.is_temporary = true 
      AND NOT EXISTS (
        SELECT 1 FROM user_sessions us 
        WHERE us.user_id = u.id AND us.disconnected_at IS NULL
      )
    `);

      const deletedUsers = [];
      for (const user of result.rows) {
        try {
          await client.query("DELETE FROM user_fcm_tokens WHERE user_id = $1", [
            user.id,
          ]);
          await client.query("DELETE FROM messages WHERE user_id = $1", [
            user.id,
          ]);
          await client.query("DELETE FROM user_sessions WHERE user_id = $1", [
            user.id,
          ]);
          await client.query("DELETE FROM users WHERE id = $1", [user.id]);

          deletedUsers.push(user.username);
          console.log(`🗑️ Cleaned up temporary user: ${user.username}`);
        } catch (error) {
          console.error(`Error cleaning up user ${user.username}:`, error);
        }
      }

      return deletedUsers;
    } catch (error) {
      console.error("Error in cleanupAllUnusedTemporaryUsers:", error);
      return [];
    } finally {
      client.release();
    }
  },

  async updateUsername(userId, newUsername) {
    const client = await pool.connect();
    try {
      // Сначала проверяем, не пытается ли пользователь установить то же имя
      const currentUser = await client.query(
        "SELECT username FROM users WHERE id = $1",
        [userId]
      );

      if (
        currentUser.rows.length > 0 &&
        currentUser.rows[0].username === newUsername
      ) {
        // Имя не изменилось - просто возвращаем текущее имя
        return { username: newUsername };
      }

      // Проверяем, занято ли имя другими пользователями
      const existingUser = await client.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [newUsername, userId]
      );

      if (existingUser.rows.length > 0) {
        // Имя занято - генерируем уникальное имя
        const uniqueUsername = `${newUsername}_${Date.now()
          .toString()
          .slice(-4)}`;

        const result = await client.query(
          "UPDATE users SET username = $1, is_temporary = false WHERE id = $2 RETURNING username",
          [uniqueUsername, userId]
        );
        return result.rows[0];
      } else {
        // Имя свободно - обновляем
        const result = await client.query(
          "UPDATE users SET username = $1, is_temporary = false WHERE id = $2 RETURNING username",
          [newUsername, userId]
        );
        return result.rows[0];
      }
    } catch (error) {
      console.error("Error in updateUsername:", error);
      throw error;
    } finally {
      client.release();
    }
  },
};



// Игровая логика
async function startGame(client, gameId, gameType) {
  await client.query('UPDATE games SET status = $1 WHERE id = $2', ['playing', gameId]);
  
  const participants = await client.query(
    'SELECT gp.user_id, u.username FROM game_participants gp JOIN users u ON gp.user_id = u.id WHERE gp.game_id = $1',
    [gameId]
  );
  
  let gameData = { gameId, gameType, players: participants.rows };
  
  switch(gameType) {
    case 'tic-tac-toe':
      gameData.board = Array(9).fill('');
      gameData.currentPlayer = 'X';
      gameData.playerSymbol = {};
      participants.rows.forEach((p, i) => {
        gameData.playerSymbol[p.user_id] = i === 0 ? 'X' : 'O';
      });
      break;
    case 'word-chain':
      gameData.words = [];
      gameData.lastLetter = '';
      break;
    case 'quiz':
      gameData.currentQuestion = getRandomQuestion();
      gameData.scores = {};
      participants.rows.forEach(p => gameData.scores[p.username] = 0);
      break;
    case 'riddle':
      gameData.currentRiddle = getRandomRiddle();
      gameData.scores = {};
      gameData.attempts = {};
      participants.rows.forEach(p => {
        gameData.scores[p.username] = 0;
        gameData.attempts[p.user_id] = 0;
      });
      break;
    case 'mafia':
      gameData = initializeMafiaGame(gameData, participants.rows);
      break;
    case 'werewolf':
      gameData = initializeWerewolfGame(gameData, participants.rows);
      break;
    case 'alias':
      gameData = initializeAliasGame(gameData, participants.rows);
      break;
    case 'uno':
      gameData = initializeUnoGame(gameData, participants.rows);
      break;
    case 'blackjack':
      gameData = initializeBlackjackGame(gameData, participants.rows);
      break;
    case 'spy':
      gameData = initializeSpyGame(gameData, participants.rows);
      break;
    case 'drawing':
      gameData = initializeDrawingGame(gameData, participants.rows);
      break;
    case 'codebreakers':
      gameData = initializeCodebreakersGame(gameData, participants.rows);
      break;
  }
  
  await client.query(
    'UPDATE games SET data = $1 WHERE id = $2',
    [gameData, gameId]
  );
  
  participants.rows.forEach(p => {
    const clientData = Array.from(clients.values()).find(c => c.userId === p.user_id);
    if (clientData && clientData.ws.readyState === WebSocket.OPEN) {
      clientData.ws.send(JSON.stringify({
        type: 'game_started',
        ...gameData,
        playerSymbol: gameData.playerSymbol?.[p.user_id]
      }));
    }
  });
}

async function handleGameMove(gameId, userId, move) {
  const client = await pool.connect();
  try {
    const gameResult = await client.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (!gameResult.rows[0]) return;
    
    const game = gameResult.rows[0];
    const gameData = typeof game.data === 'string' ? JSON.parse(game.data || '{}') : (game.data || {});
    
    let isValidMove = false;
    let gameEnded = false;
    let winner = null;
    
    switch(game.type) {
      case 'tic-tac-toe':
        if (gameData.playerSymbol[userId] === gameData.currentPlayer && !gameData.board[move.position]) {
          gameData.board[move.position] = gameData.currentPlayer;
          gameData.currentPlayer = gameData.currentPlayer === 'X' ? 'O' : 'X';
          isValidMove = true;
          
          const winResult = checkTicTacToeWin(gameData.board);
          if (winResult.winner) {
            gameEnded = true;
            winner = Object.keys(gameData.playerSymbol).find(id => gameData.playerSymbol[id] === winResult.winner);
          } else if (gameData.board.every(cell => cell)) {
            gameEnded = true;
          }
        }
        break;
        
      case 'word-chain':
        const word = move.word.toLowerCase();
        let lastChar = gameData.lastLetter;
        
        // Если последняя буква ь, ъ, ы - берем предпоследнюю
        if (gameData.words.length > 0) {
          const lastWord = gameData.words[gameData.words.length - 1];
          for (let i = lastWord.length - 1; i >= 0; i--) {
            const char = lastWord[i];
            if (char !== 'ь' && char !== 'ъ' && char !== 'ы') {
              lastChar = char;
              break;
            }
          }
        }
        
        if (word.length >= 3 && (!lastChar || word[0] === lastChar)) {
          gameData.words.push(word);
          // Определяем последнюю букву для следующего слова
          let nextLetter = word[word.length - 1];
          for (let i = word.length - 1; i >= 0; i--) {
            const char = word[i];
            if (char !== 'ь' && char !== 'ъ' && char !== 'ы') {
              nextLetter = char;
              break;
            }
          }
          gameData.lastLetter = nextLetter;
          isValidMove = true;
        }
        break;
        
      case 'quiz':
        if (gameData.currentQuestion && move.answer !== undefined) {
          const user = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
          if (move.answer === gameData.currentQuestion.correct) {
            gameData.scores[user.rows[0].username]++;
          }
          gameData.currentQuestion = getRandomQuestion();
          isValidMove = true;
        }
        break;
      case 'riddle':
        if (gameData.currentRiddle && move.answer) {
          const user = await client.query('SELECT username FROM users WHERE id = $1', [userId]);
          const userAnswer = move.answer.toLowerCase().trim();
          const correctAnswer = gameData.currentRiddle.answer.toLowerCase();
          
          gameData.attempts[userId] = (gameData.attempts[userId] || 0) + 1;
          
          if (userAnswer === correctAnswer) {
            gameData.scores[user.rows[0].username]++;
            gameData.currentRiddle = getRandomRiddle();
            gameData.attempts = {}; // Сбрасываем попытки для новой загадки
            const participantsResult = await client.query(
              'SELECT gp.user_id FROM game_participants gp WHERE gp.game_id = $1',
              [gameId]
            );
            participantsResult.rows.forEach(p => gameData.attempts[p.user_id] = 0);
          } else if (gameData.attempts[userId] >= 3) {
            // После 3 неправильных ответов показываем подсказку
            if (!gameData.currentRiddle.hintsShown) {
              gameData.currentRiddle.hintsShown = 1;
            } else if (gameData.currentRiddle.hintsShown < gameData.currentRiddle.hints.length) {
              gameData.currentRiddle.hintsShown++;
            }
          }
          isValidMove = true;
        }
        break;
    }
    
    if (isValidMove) {
      await client.query('UPDATE games SET data = $1 WHERE id = $2', [gameData, gameId]);
      
      if (gameEnded) {
        await client.query('UPDATE games SET status = $1 WHERE id = $2', ['finished', gameId]);
        
        const participants = await client.query(
          'SELECT gp.user_id FROM game_participants gp WHERE gp.game_id = $1',
          [gameId]
        );
        
        let resultText = winner ? `Победил игрок!` : 'Ничья!';
        
        participants.rows.forEach(p => {
          const clientData = Array.from(clients.values()).find(c => c.userId === p.user_id);
          if (clientData && clientData.ws.readyState === WebSocket.OPEN) {
            clientData.ws.send(JSON.stringify({
              type: 'game_ended',
              gameId,
              result: resultText,
              winner: winner
            }));
          }
        });
        
        // Обрабатываем завершение игры (в том числе турнирной)
        if (winner) {
          await handleGameEnd(gameId, winner);
        }
      } else {
        const participants = await client.query(
          'SELECT gp.user_id FROM game_participants gp WHERE gp.game_id = $1',
          [gameId]
        );
        
        participants.rows.forEach(p => {
          const clientData = Array.from(clients.values()).find(c => c.userId === p.user_id);
          if (clientData && clientData.ws.readyState === WebSocket.OPEN) {
            clientData.ws.send(JSON.stringify({
              type: 'game_move',
              gameId,
              gameType: game.type,
              ...gameData,
              playerSymbol: gameData.playerSymbol?.[p.user_id]
            }));
          }
        });
      }
    }
  } finally {
    client.release();
  }
}

function checkTicTacToeWin(board) {
  const lines = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  
  for (let line of lines) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return { winner: null };
}

function getRandomQuestion() {
  const questions = [
    { question: 'Столица России?', options: ['Москва', 'СПб', 'Казань', 'Сочи'], correct: 0 },
    { question: '2 + 2 = ?', options: ['3', '4', '5', '6'], correct: 1 },
    { question: 'Самая большая планета?', options: ['Земля', 'Марс', 'Юпитер', 'Сатурн'], correct: 2 },
    { question: 'Автор "Войны и мира"?', options: ['Пушкин', 'Толстой', 'Достоевский', 'Чехов'], correct: 1 },
    { question: 'Сколько континентов на Земле?', options: ['5', '6', '7', '8'], correct: 2 },
    { question: 'В каком году началась Вторая мировая война?', options: ['1938', '1939', '1940', '1941'], correct: 1 },
    { question: 'Какой химический элемент обозначается символом Au?', options: ['Серебро', 'Золото', 'Медь', 'Железо'], correct: 1 },
    { question: 'Кто написал "Гарри Поттера"?', options: ['Дж. Толкин', 'Дж. Роулинг', 'С. Кинг', 'Дж. Мартин'], correct: 1 },
    { question: 'Сколько дней в високосном году?', options: ['365', '366', '367', '364'], correct: 1 },
    { question: 'Какая самая длинная река в мире?', options: ['Амазонка', 'Нил', 'Волга', 'Миссисипи'], correct: 1 },
    { question: 'В каком городе находится Эрмитаж?', options: ['Москва', 'Санкт-Петербург', 'Казань', 'Новгород'], correct: 1 },
    { question: 'Сколько струн у классической гитары?', options: ['4', '5', '6', '7'], correct: 2 },
    { question: 'Какой океан самый большой?', options: ['Атлантический', 'Индийский', 'Северный Ледовитый', 'Тихий'], correct: 3 },
    { question: 'Кто изобрел телефон?', options: ['Эдисон', 'Белл', 'Тесла', 'Маркони'], correct: 1 },
    { question: 'Столица Японии?', options: ['Осака', 'Киото', 'Токио', 'Нагоя'], correct: 2 }
  ];
  return questions[Math.floor(Math.random() * questions.length)];
}

function getRandomRiddle() {
  const riddles = [
    { question: 'Висит груша - нельзя скушать', answer: 'лампочка', hints: ['Светит в темноте', 'Электрический предмет'] },
    { question: 'Зимой и летом одним цветом', answer: 'елка', hints: ['Дерево', 'Новогоднее'] },
    { question: 'Сто одежек и все без застежек', answer: 'капуста', hints: ['Овощ', 'Растет в огороде'] },
    { question: 'Не лает, не кусает, а в дом не пускает', answer: 'замок', hints: ['На двери', 'Нужен ключ'] },
    { question: 'Течет, течет - не вытечет, бежит, бежит - не выбежит', answer: 'река', hints: ['Водоем', 'Течет к морю'] },
    { question: 'Что можно увидеть с закрытыми глазами?', answer: 'сон', hints: ['Происходит ночью', 'Бывает цветным'] },
    { question: 'Кто говорит на всех языках?', answer: 'эхо', hints: ['Повторяет звуки', 'В горах слышно'] },
    { question: 'Что становится больше, если его поставить вверх ногами?', answer: 'число 6', hints: ['Цифра', 'Математика'] },
    { question: 'Чем больше из неё берёшь, тем больше она становится', answer: 'яма', hints: ['В земле', 'Копают лопатой'] },
    { question: 'Что идет, не двигаясь с места?', answer: 'время', hints: ['Измеряется часами', 'Не остановить'] },
    { question: 'У кого есть шляпа без головы и нога без сапога?', answer: 'гриб', hints: ['Растет в лесу', 'Можно есть'] },
    { question: 'Что можно приготовить, но нельзя съесть?', answer: 'уроки', hints: ['Делают дома', 'Школьное'] },
    { question: 'Сидит дед во сто шуб одет, кто его раздевает, тот слезы проливает', answer: 'лук', hints: ['Овощ', 'Заставляет плакать'] },
    { question: 'Маленький, удаленький, сквозь землю прошёл, красну шапочку нашёл', answer: 'гриб', hints: ['Растет после дождя', 'Собирают в корзину'] },
    { question: 'Что всегда увеличивается и никогда не уменьшается?', answer: 'возраст', hints: ['У всех людей', 'Считается годами'] }
  ];
  return riddles[Math.floor(Math.random() * riddles.length)];
}

// Инициализация игр для 3-5 игроков
function initializeMafiaGame(gameData, players) {
  const playerCount = players.length;
  if (playerCount < 3) return gameData;
  
  const mafiaCount = Math.max(1, Math.floor(playerCount / 3));
  const roles = {};
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  
  // Назначаем мафию
  for (let i = 0; i < mafiaCount; i++) {
    roles[shuffledPlayers[i].user_id] = 'mafia';
  }
  
  // Назначаем специальные роли
  let roleIndex = mafiaCount;
  if (playerCount >= 4 && roleIndex < playerCount) {
    roles[shuffledPlayers[roleIndex].user_id] = 'doctor';
    roleIndex++;
  }
  if (playerCount >= 5 && roleIndex < playerCount) {
    roles[shuffledPlayers[roleIndex].user_id] = 'detective';
    roleIndex++;
  }
  
  // Остальные - мирные жители
  shuffledPlayers.forEach(p => {
    if (!roles[p.user_id]) {
      roles[p.user_id] = 'citizen';
    }
  });
  
  gameData.roles = roles;
  gameData.phase = 'day';
  gameData.day = 1;
  gameData.votes = {};
  gameData.alive = players.map(p => p.user_id);
  gameData.nightActions = {};
  
  return gameData;
}

function initializeWerewolfGame(gameData, players) {
  const playerCount = players.length;
  if (playerCount < 3) return gameData;
  
  const werewolfCount = Math.max(1, Math.floor(playerCount / 3));
  const roles = {};
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  
  // Назначаем оборотней
  for (let i = 0; i < werewolfCount; i++) {
    roles[shuffledPlayers[i].user_id] = 'werewolf';
  }
  
  // Назначаем специальные роли
  let roleIndex = werewolfCount;
  if (playerCount >= 4 && roleIndex < playerCount) {
    roles[shuffledPlayers[roleIndex].user_id] = 'seer';
    roleIndex++;
  }
  if (playerCount >= 5 && roleIndex < playerCount) {
    roles[shuffledPlayers[roleIndex].user_id] = 'bodyguard';
    roleIndex++;
  }
  
  // Остальные - жители
  shuffledPlayers.forEach(p => {
    if (!roles[p.user_id]) {
      roles[p.user_id] = 'villager';
    }
  });
  
  gameData.roles = roles;
  gameData.phase = 'day';
  gameData.night = 0;
  gameData.votes = {};
  gameData.alive = players.map(p => p.user_id);
  gameData.nightActions = {};
  
  return gameData;
}

function initializeAliasGame(gameData, players) {
  const teams = {};
  const teamCount = Math.max(2, Math.ceil(players.length / 2));
  
  players.forEach((p, i) => {
    const teamId = i % teamCount;
    if (!teams[teamId]) teams[teamId] = [];
    teams[teamId].push(p.user_id);
  });
  
  gameData.teams = teams;
  gameData.currentTeam = 0;
  gameData.currentWord = getRandomAliasWord();
  gameData.scores = {};
  gameData.timeLeft = 60;
  gameData.round = 1;
  gameData.wordsGuessed = 0;
  gameData.targetScore = 30;
  
  Object.keys(teams).forEach(teamId => {
    gameData.scores[teamId] = 0;
  });
  
  return gameData;
}

function initializeUnoGame(gameData, players) {
  const deck = createUnoDeck();
  const hands = {};
  
  players.forEach(p => {
    hands[p.user_id] = [];
    for (let i = 0; i < 7; i++) {
      hands[p.user_id].push(deck.pop());
    }
  });
  
  gameData.hands = hands;
  gameData.deck = deck;
  gameData.currentCard = deck.pop();
  gameData.currentPlayer = players[0].user_id;
  gameData.direction = 1;
  gameData.drawCount = 0;
  
  return gameData;
}

function initializeBlackjackGame(gameData, players) {
  const deck = createStandardDeck();
  const hands = {};
  const bets = {};
  
  players.forEach(p => {
    hands[p.user_id] = [];
    bets[p.user_id] = 10;
  });
  
  gameData.hands = hands;
  gameData.bets = bets;
  gameData.deck = deck;
  gameData.dealerHand = [];
  gameData.phase = 'betting';
  
  return gameData;
}

function getRandomAliasWord() {
  const words = [
    'кот', 'собака', 'дом', 'машина', 'телефон', 'компьютер', 'книга', 'стол', 'стул', 'окно',
    'дерево', 'цветок', 'солнце', 'луна', 'звезда', 'море', 'река', 'гора', 'лес', 'поле',
    'самолет', 'поезд', 'велосипед', 'мост', 'замок', 'корабль', 'остров', 'пустыня', 'джунгли', 'снег',
    'огонь', 'вода', 'земля', 'воздух', 'радуга', 'молния', 'гром', 'ветер', 'туман', 'дождь',
    'музыка', 'танец', 'песня', 'картина', 'фильм', 'театр', 'цирк', 'праздник', 'подарок', 'торт',
    'школа', 'учитель', 'ученик', 'урок', 'экзамен', 'каникулы', 'друг', 'семья', 'родители', 'дети'
  ];
  return words[Math.floor(Math.random() * words.length)];
}

function createUnoDeck() {
  const colors = ['red', 'blue', 'green', 'yellow'];
  const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const specials = ['skip', 'reverse', 'draw2'];
  const deck = [];

  colors.forEach(color => {
    numbers.forEach(number => {
      deck.push({ color, value: number });
      if (number !== 0) deck.push({ color, value: number });
    });
    specials.forEach(special => {
      deck.push({ color, value: special });
      deck.push({ color, value: special });
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'black', value: 'wild' });
    deck.push({ color: 'black', value: 'draw4' });
  }

  return shuffleDeck(deck);
}

function createStandardDeck() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  suits.forEach(suit => {
    values.forEach(value => {
      deck.push({ suit, value });
    });
  });

  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Функции для турниров
async function startTournament(client, tournamentId, tournament) {
  try {
    // Получаем всех участников
    const participants = await client.query(
      'SELECT tp.user_id, u.username FROM tournament_participants tp JOIN users u ON tp.user_id = u.id WHERE tp.tournament_id = $1',
      [tournamentId]
    );
    
    if (participants.rows.length < 3) {
      throw new Error('Недостаточно участников');
    }
    
    // Создаем сетку турнира
    const bracket = createTournamentBracket(participants.rows);
    
    // Обновляем статус турнира
    await client.query(
      'UPDATE tournaments SET status = $1, data = $2 WHERE id = $3',
      ['started', JSON.stringify(bracket), tournamentId]
    );
    
    // Уведомляем всех о старте
    broadcast({
      type: 'tournament_started',
      tournamentId: tournamentId,
      name: tournament.name,
      bracket: bracket,
      gameType: tournament.game_type
    });
    
    // Запускаем первые игры
    await startTournamentRound(client, tournamentId, bracket, 0);
    
  } catch (error) {
    console.error('Ошибка запуска турнира:', error);
    throw error;
  }
}

function createTournamentBracket(participants) {
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const rounds = [];
  let currentRound = shuffled;
  
  while (currentRound.length > 1) {
    const matches = [];
    for (let i = 0; i < currentRound.length; i += 2) {
      if (i + 1 < currentRound.length) {
        matches.push({
          player1: currentRound[i],
          player2: currentRound[i + 1],
          winner: null,
          gameId: null,
          status: 'waiting'
        });
      } else {
        // Нечетное количество - проход без игры
        matches.push({
          player1: currentRound[i],
          player2: null,
          winner: currentRound[i],
          gameId: null,
          status: 'bye'
        });
      }
    }
    rounds.push(matches);
    currentRound = matches.map(m => m.winner || { user_id: null, username: 'TBD' });
  }
  
  return {
    rounds: rounds,
    currentRound: 0,
    status: 'active'
  };
}

async function startTournamentRound(client, tournamentId, bracket, roundIndex) {
  const round = bracket.rounds[roundIndex];
  
  for (const match of round) {
    if (match.status === 'waiting' && match.player2) {
      // Создаем игру для матча
      const tournament = await client.query('SELECT game_type FROM tournaments WHERE id = $1', [tournamentId]);
      const gameType = tournament.rows[0].game_type;
      
      const gameResult = await client.query(
        'INSERT INTO games (type, creator_id, data, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [gameType, match.player1.user_id, JSON.stringify({ tournamentId, matchId: `${roundIndex}-${round.indexOf(match)}` }), 'waiting']
      );
      
      const gameId = gameResult.rows[0].id;
      match.gameId = gameId;
      match.status = 'playing';
      
      // Добавляем участников в игру
      await client.query(
        'INSERT INTO game_participants (game_id, user_id) VALUES ($1, $2), ($1, $3)',
        [gameId, match.player1.user_id, match.player2.user_id]
      );
      
      // Уведомляем игроков
      [match.player1.user_id, match.player2.user_id].forEach(playerId => {
        const clientData = Array.from(clients.values()).find(c => c.userId === playerId);
        if (clientData && clientData.ws.readyState === WebSocket.OPEN) {
          clientData.ws.send(JSON.stringify({
            type: 'tournament_match_ready',
            tournamentId: tournamentId,
            gameId: gameId,
            opponent: playerId === match.player1.user_id ? match.player2.username : match.player1.username,
            round: roundIndex + 1
          }));
        }
      });
      
      // Запускаем игру
      await startGame(client, gameId, gameType);
    }
  }
  
  // Обновляем данные турнира
  await client.query(
    'UPDATE tournaments SET data = $1 WHERE id = $2',
    [JSON.stringify(bracket), tournamentId]
  );
}

async function handleTournamentAction(tournamentId, userId, action, data) {
  const client = await pool.connect();
  try {
    const tournament = await client.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [tournamentId]
    );
    
    if (tournament.rows.length === 0) return;
    
    const tournamentData = tournament.rows[0];
    const bracket = typeof tournamentData.data === 'string' ? 
      JSON.parse(tournamentData.data || '{}') : (tournamentData.data || {});
    
    switch (action) {
      case 'match_finished':
        await handleTournamentMatchFinished(client, tournamentId, bracket, data.gameId, data.winnerId);
        break;
      case 'get_bracket':
        const clientData = Array.from(clients.values()).find(c => c.userId === userId);
        if (clientData && clientData.ws.readyState === WebSocket.OPEN) {
          clientData.ws.send(JSON.stringify({
            type: 'tournament_bracket',
            tournamentId: tournamentId,
            bracket: bracket
          }));
        }
        break;
    }
  } finally {
    client.release();
  }
}

async function handleTournamentMatchFinished(client, tournamentId, bracket, gameId, winnerId) {
  // Находим матч по gameId
  let matchFound = false;
  
  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    for (let matchIndex = 0; matchIndex < round.length; matchIndex++) {
      const match = round[matchIndex];
      if (match.gameId === gameId) {
        match.winner = match.player1.user_id === winnerId ? match.player1 : match.player2;
        match.status = 'finished';
        matchFound = true;
        break;
      }
    }
    if (matchFound) break;
  }
  
  // Проверяем, завершен ли текущий раунд
  const currentRound = bracket.rounds[bracket.currentRound];
  const allMatchesFinished = currentRound.every(match => match.status === 'finished' || match.status === 'bye');
  
  if (allMatchesFinished) {
    bracket.currentRound++;
    
    if (bracket.currentRound < bracket.rounds.length) {
      // Запускаем следующий раунд
      await startTournamentRound(client, tournamentId, bracket, bracket.currentRound);
    } else {
      // Турнир завершен
      const winner = bracket.rounds[bracket.rounds.length - 1][0].winner;
      await client.query(
        'UPDATE tournaments SET status = $1 WHERE id = $2',
        ['finished', tournamentId]
      );
      
      broadcast({
        type: 'tournament_finished',
        tournamentId: tournamentId,
        winner: winner
      });
    }
  }
  
  // Обновляем данные турнира
  await client.query(
    'UPDATE tournaments SET data = $1 WHERE id = $2',
    [JSON.stringify(bracket), tournamentId]
  );
  
  // Уведомляем о обновлении сетки
  broadcast({
    type: 'tournament_bracket_updated',
    tournamentId: tournamentId,
    bracket: bracket
  });
}

// Новые игры для 3-5 игроков
function initializeSpyGame(gameData, players) {
  if (players.length < 3) return gameData;
  
  const locations = [
    'школа', 'больница', 'ресторан', 'аэропорт', 'пляж', 'казино', 'цирк', 'поезд',
    'космическая станция', 'пиратский корабль', 'зоопарк', 'музей'
  ];
  
  const spyCount = Math.max(1, Math.floor(players.length / 4));
  const location = locations[Math.floor(Math.random() * locations.length)];
  const roles = {};
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  
  // Назначаем шпионов
  for (let i = 0; i < spyCount; i++) {
    roles[shuffledPlayers[i].user_id] = 'spy';
  }
  
  // Остальные - мирные
  shuffledPlayers.forEach(p => {
    if (!roles[p.user_id]) {
      roles[p.user_id] = 'civilian';
    }
  });
  
  gameData.roles = roles;
  gameData.location = location;
  gameData.phase = 'discussion';
  gameData.timeLeft = 300; // 5 минут
  gameData.votes = {};
  gameData.currentSpeaker = 0;
  
  return gameData;
}

function initializeDrawingGame(gameData, players) {
  if (players.length < 3) return gameData;
  
  const words = [
    'кот', 'собака', 'дом', 'машина', 'солнце', 'дерево', 'цветок', 'рыба',
    'птица', 'самолет', 'корабль', 'замок', 'гора', 'море', 'лес', 'поле'
  ];
  
  gameData.currentWord = words[Math.floor(Math.random() * words.length)];
  gameData.currentDrawer = players[0].user_id;
  gameData.round = 1;
  gameData.maxRounds = players.length;
  gameData.scores = {};
  gameData.timeLeft = 60;
  gameData.guessed = [];
  
  players.forEach(p => {
    gameData.scores[p.username] = 0;
  });
  
  return gameData;
}

function initializeCodebreakersGame(gameData, players) {
  if (players.length < 3) return gameData;
  
  const words = [
    'кот', 'собака', 'дом', 'машина', 'солнце', 'луна', 'звезда', 'море',
    'гора', 'лес', 'цветок', 'дерево', 'птица', 'рыба', 'огонь', 'вода'
  ];
  
  // Создаем команды
  const teams = { red: [], blue: [] };
  players.forEach((p, i) => {
    if (i % 2 === 0) {
      teams.red.push(p.user_id);
    } else {
      teams.blue.push(p.user_id);
    }
  });
  
  // Выбираем капитанов
  gameData.teams = teams;
  gameData.captains = {
    red: teams.red[0],
    blue: teams.blue[0]
  };
  gameData.currentTeam = 'red';
  gameData.words = words.slice(0, 25).sort(() => Math.random() - 0.5);
  gameData.wordTypes = generateCodebreakersGrid();
  gameData.revealed = [];
  gameData.scores = { red: 0, blue: 0 };
  
  return gameData;
}

function generateCodebreakersGrid() {
  const types = [];
  // 9 красных, 8 синих, 7 нейтральных, 1 черная
  for (let i = 0; i < 9; i++) types.push('red');
  for (let i = 0; i < 8; i++) types.push('blue');
  for (let i = 0; i < 7; i++) types.push('neutral');
  types.push('black');
  
  return types.sort(() => Math.random() - 0.5);
}



// Обновляем обработчик завершения игры
async function handleGameEnd(gameId, winnerId) {
  const client = await pool.connect();
  try {
    const game = await client.query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (game.rows.length === 0) return;
    
    const gameData = typeof game.rows[0].data === 'string' ? 
      JSON.parse(game.rows[0].data || '{}') : (game.rows[0].data || {});
    
    // Проверяем, является ли это турнирной игрой
    if (gameData.tournamentId) {
      await handleTournamentAction(gameData.tournamentId, winnerId, 'match_finished', {
        gameId: gameId,
        winnerId: winnerId
      });
    }
  } finally {
    client.release();
  }
}

// HTTP сервер
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://cosmocatchat277.netlify.app/");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-session-id");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname || "/";

  async function parseBody() {
    return new Promise((resolve, reject) => {
      let body = [];
      req
        .on("data", (chunk) => body.push(chunk))
        .on("end", () => {
          try {
            const raw = Buffer.concat(body).toString();
            resolve(raw ? JSON.parse(raw) : {});
          } catch (e) {
            resolve({});
          }
        })
        .on("error", reject);
    });
  }

  async function getCurrentUserId() {
    const sessionId = req.headers["x-session-id"];
    if (!sessionId) return null;
    const client = await pool.connect();
    try {
      const r = await client.query(
        "SELECT user_id FROM user_sessions WHERE session_id = $1 AND disconnected_at IS NULL ORDER BY connected_at DESC LIMIT 1",
        [sessionId]
      );
      return r.rows[0]?.user_id || null;
    } finally { client.release(); }
  }

  // API
  try {
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString(), clients: clients.size, rooms: rooms.size, database: "connected" }));
      return;
    }

    // API для получения стикеров
    if (pathname === "/api/stickers" && req.method === "GET") {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT id, name, emoji, category FROM stickers ORDER BY category, name');
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.rows));
        return;
      } finally {
        client.release();
      }
    }

    if (pathname.startsWith("/api/profile/") && req.method === "GET") {
      const id = parseInt(pathname.split("/").pop(), 10);
      const client = await pool.connect();
      try {
        const r = await client.query("SELECT id, username, avatar_url, bio, status, created_at, last_seen FROM users WHERE id=$1", [id]);
        if (!r.rows[0]) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Not found" })); return; }
        const level = await client.query("SELECT level, experience, messages_count, games_won, achievements FROM user_levels WHERE user_id=$1", [id]);
        const data = r.rows[0];
        data.level = level.rows[0] || { level: 1, experience: 0, messages_count: 0, games_won: 0, achievements: [] };
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); return;
      } finally { client.release(); }
    }

    if (pathname === "/api/profile" && req.method === "PUT") {
      const uid = await getCurrentUserId();
      if (!uid) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      const body = await parseBody();
      const { avatar_url, bio, status } = body;
      const client = await pool.connect();
      try {
        await client.query("UPDATE users SET avatar_url=$1, bio=$2, status=$3 WHERE id=$4", [avatar_url || null, bio || null, status || null, uid]);
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true })); return;
      } finally { client.release(); }
    }

    // Игры API
    if (pathname === "/api/games" && req.method === "POST") {
      const uid = await getCurrentUserId(); if (!uid) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      const body = await parseBody(); const { type, data } = body;
      const client = await pool.connect();
      try { const r = await client.query("INSERT INTO games(type, creator_id, data) VALUES($1,$2,$3) RETURNING id", [type, uid, JSON.stringify(data || {})]);
        const gameId = r.rows[0].id;
        await client.query("INSERT INTO game_participants(game_id, user_id) VALUES($1,$2)", [gameId, uid]);
        broadcast({ type: "game_created", gameId, gameType: type, creator: uid });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ gameId })); return; } finally { client.release(); }
    }

    if (pathname.match(/^\/api\/games\/(\d+)\/join$/) && req.method === "POST") {
      const uid = await getCurrentUserId(); if (!uid) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      const gameId = parseInt(pathname.split("/")[3], 10);
      const client = await pool.connect();
      try { await client.query("INSERT INTO game_participants(game_id, user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [gameId, uid]);
        broadcast({ type: "game_joined", gameId, userId: uid });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true })); return; } finally { client.release(); }
    }

    // Опросы API
    if (pathname === "/api/polls" && req.method === "POST") {
      const uid = await getCurrentUserId(); if (!uid) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      const body = await parseBody(); const { question, options, duration } = body;
      const client = await pool.connect();
      try { const expiresAt = duration ? new Date(Date.now() + duration * 60000) : null;
        const r = await client.query("INSERT INTO polls(creator_id, question, options, expires_at) VALUES($1,$2,$3,$4) RETURNING id", [uid, question, JSON.stringify(options), expiresAt]);
        const poll = { id: r.rows[0].id, question, options, expiresAt, creatorId: uid };
        broadcast({ type: "poll_created", poll });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(poll)); return; } finally { client.release(); }
    }

    if (pathname.match(/^\/api\/polls\/(\d+)\/vote$/) && req.method === "POST") {
      const uid = await getCurrentUserId(); if (!uid) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
      const pollId = parseInt(pathname.split("/")[3], 10);
      const body = await parseBody(); const { optionIndex } = body;
      const client = await pool.connect();
      try { await client.query("INSERT INTO poll_votes(poll_id, user_id, option_index) VALUES($1,$2,$3) ON CONFLICT (poll_id, user_id) DO UPDATE SET option_index=$3", [pollId, uid, optionIndex]);
        broadcast({ type: "poll_voted", pollId, userId: uid, optionIndex });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true })); return; } finally { client.release(); }
    }

    // Новые утилиты API
    if (pathname === "/api/backup/create" && req.method === "POST") {
      const result = await backupManager.createBackup();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === "/api/backup/list" && req.method === "GET") {
      const backups = await backupManager.getBackupList();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(backups));
      return;
    }

    if (pathname === "/api/stats/daily" && req.method === "GET") {
      const stats = await chatStats.getDailyStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (pathname === "/api/stats/weekly" && req.method === "GET") {
      const stats = await chatStats.getWeeklyStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (pathname === "/api/stats/system" && req.method === "GET") {
      const stats = await chatStats.getSystemStats();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if (pathname === "/api/cache/stats" && req.method === "GET") {
      const cacheStats = {
        size: cache.size(),
        keys: cache.keys().slice(0, 10)
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(cacheStats));
      return;
    }

    if (pathname === "/api/cache/clear" && req.method === "POST") {
      cache.clear();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "Cache cleared" }));
      return;
    }

    if (pathname === "/api/logs" && req.method === "GET") {
      const type = parsedUrl.query.type || 'app';
      const days = parseInt(parsedUrl.query.days) || 1;
      const logs = logger.getLogs(type, days);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(logs));
      return;
    }

    if (pathname === "/api/performance" && req.method === "GET") {
      const data = {
        metrics: performance.getMetrics(),
        alerts: performance.getAlerts(),
        system: performance.getSystemInfo()
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === "/api/analytics" && req.method === "GET") {
      const data = {
        topEvents: analytics.getTopEvents(),
        activeUsers: analytics.getActiveUsers(),
        recentEvents: analytics.getEvents({ limit: 20 })
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === "/api/security" && req.method === "GET") {
      const data = {
        suspiciousActivity: security.getSuspiciousActivity(),
        blockedIPs: Array.from(security.blockedIPs)
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
      return;
    }

    if (pathname === "/api/tasks" && req.method === "GET") {
      const tasks = scheduler.getTasks();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(tasks));
      return;
    }

    if (pathname === "/api/reports/daily" && req.method === "GET") {
      const report = await reports.generateDailyReport();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
      return;
    }

    if (pathname === "/api/reports/weekly" && req.method === "GET") {
      const report = await reports.generateWeeklyReport();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
      return;
    }

    if (pathname === "/api/reports/health" && req.method === "GET") {
      const report = reports.generateHealthReport();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report));
      return;
    }

    if (pathname === "/api/notifications" && req.method === "GET") {
      const uid = await getCurrentUserId();
      if (!uid) { 
        res.writeHead(401, { "Content-Type": "application/json" }); 
        res.end(JSON.stringify({ error: "Unauthorized" })); 
        return; 
      }
      const history = notifications.getHistory(uid, 20);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(history));
      return;
    }

    if (pathname.match(/^\/api\/notifications\/(\d+)\/read$/) && req.method === "POST") {
      const notificationId = parseInt(pathname.split("/")[3], 10);
      notifications.markAsRead(notificationId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (pathname === "/api/private-rooms" && req.method === "GET") {
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT pr.id, pr.name, pr.created_at, u.username as creator,
                 CASE WHEN pr.password_hash IS NOT NULL THEN true ELSE false END as has_password
          FROM private_rooms pr
          JOIN users u ON pr.creator_id = u.id
          ORDER BY pr.created_at DESC
          LIMIT 20
        `);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result.rows));
        return;
      } finally {
        client.release();
      }
    }

    if (pathname === "/api/search" && req.method === "GET") {
      const q = (parsedUrl.query.query || "").trim();
      const client = await pool.connect();
      try { 
        const r = await client.query("SELECT id, username, avatar_url, status FROM users WHERE username ILIKE $1 ORDER BY username LIMIT 20", ["%" + q + "%"]);
        res.writeHead(200, { "Content-Type": "application/json" }); 
        res.end(JSON.stringify(r.rows)); 
        return; 
      } finally { 
        client.release(); 
      }
    }

    // Стикеры API
    if (pathname === "/api/stickers" && req.method === "GET") {
      const client = await pool.connect();
      try { 
        const r = await client.query("SELECT * FROM stickers ORDER BY category, name");
        res.writeHead(200, { "Content-Type": "application/json" }); 
        res.end(JSON.stringify(r.rows)); 
        return; 
      } finally { 
        client.release(); 
      }
    }


  } catch (e) {
    console.error("API error:", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server error" }));
    return;
  }

  let filePath = req.url;
  if (filePath === "/") filePath = "/index.html";

  const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, "");
  const fullPath = path.join(__dirname, safePath);

  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  // Проверяем, является ли запрос статическим файлом
  const staticExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.json', '.txt', '.webmanifest'];
  const ext = path.extname(filePath).toLowerCase();
  
  // Для статических файлов ищем в папке public
  let actualPath;
  if (staticExtensions.includes(ext)) {
    actualPath = path.join(__dirname, 'public', filePath);
  } else {
    actualPath = path.join(__dirname, filePath);
  }

  const normalizedPath = path.normalize(actualPath).replace(/^(\.\.[\/\\])+/, "");
  
  // Проверяем, что путь безопасен
  if (!normalizedPath.startsWith(path.join(__dirname, 'public')) && staticExtensions.includes(ext)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  console.log(`📁 Serving static file: ${filePath} -> ${actualPath}`);

  fs.stat(actualPath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.log(`❌ File not found: ${actualPath}`);
      
      // Для HTML файлов возвращаем index.html
      if (ext === '.html' || filePath === '/') {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        if (fs.existsSync(indexPath)) {
          console.log(`📄 Serving index.html`);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("File not found");
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("File not found");
      }
      return;
    }

    const fileExt = path.extname(actualPath).toLowerCase();
    // Улучшенные типы контента
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".webmanifest": "application/manifest+json",
      ".json": "application/json",
      ".txt": "text/plain; charset=utf-8",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject"
    };

    const contentType = contentTypes[fileExt] || "application/octet-stream";

    // Кэширование: статические ресурсы кэшируются, HTML - нет
    const cacheControl = fileExt === '.html' || fileExt === '.js' ? 'no-cache' : 'public, max-age=86400';

    console.log(`✅ Serving ${filePath} (${contentType})`);
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff"
    });

    fs.createReadStream(actualPath).pipe(res);
  });
});

// WebSocket сервер
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: false,
  clientTracking: true,
});

const clients = new Map();
const rooms = new Map();

function broadcast(data, exceptSessionId = null) {
  const message = JSON.stringify(data);
  clients.forEach((client, sessionId) => {
    if (
      sessionId !== exceptSessionId &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      try {
        client.ws.send(message);
      } catch (error) {
        console.error(`Error broadcasting to client ${sessionId}:`, error);
      }
    }
  });
}

function broadcastToRoom(roomId, data, exceptSessionId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  const message = JSON.stringify(data);
  room.users.forEach((userInfo, sessionId) => {
    if (sessionId !== exceptSessionId && clients.has(sessionId)) {
      const client = clients.get(sessionId);
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(message);
        } catch (error) {
          console.error(
            `Error broadcasting to room client ${sessionId}:`,
            error
          );
        }
      }
    }
  });
}

async function broadcastUsers() {
  try {
    const onlineUsers = await db.getOnlineUsers();
    const usersData = onlineUsers.map((user) => ({
      id: user.id,
      name: user.username,
      isOnline: true,
    }));

    console.log(`📊 Broadcasting ${usersData.length} online users`);
    broadcast({ type: "users", users: usersData });
  } catch (error) {
    console.error("Error broadcasting users:", error);
  }
}

wss.on("connection", async (ws, req) => {
  const sessionId = `session_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  let currentUser = null;
  let userId = null;
  
  // Получаем IP адрес
  const clientIP = IPUtils.getClientIP(req);
  const ipInfo = IPUtils.getIPInfo(clientIP);
  
  // Проверяем блокировку
  if (security.isBlocked(clientIP)) {
    logger.warn('Blocked IP attempted connection', { ip: ipInfo.anonymized });
    ws.close(1008, 'IP blocked');
    return;
  }

  console.log(`🔌 New WebSocket connection: ${sessionId} from ${ipInfo.anonymized}`);

  try {
    // Создаем временное имя пользователя
    const tempUsername = `User_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 6)}`;
    currentUser = await db.findOrCreateUser(tempUsername);
    userId = currentUser.id;

    // Создаем сессию (она сама очистит дубликаты)
    await db.createUserSession(userId, sessionId);

    // Сохраняем в памяти
    clients.set(sessionId, { ws, user: currentUser, userId, sessionId });

    // Отправляем историю и инициализацию
    const history = await db.getMessageHistory();
    ws.send(JSON.stringify({ type: "history", history }));
    ws.send(
      JSON.stringify({
        type: "init",
        id: userId,
        name: currentUser.username,
        sessionId: sessionId,
      })
    );

    await db.saveMessage(
      userId,
      "system",
      `${currentUser.username} вошёл в чат`
    );
    broadcast(
      { type: "system", text: `🐱 ${currentUser.username} вошёл в чат` },
      sessionId
    );
    await broadcastUsers();

    // Аналитика и уведомления
    analytics.track('user_connected', userId, { username: currentUser.username });
    logger.userAction(currentUser.username, 'connected', { sessionId });
    
    // Подписываем на уведомления
    notifications.subscribe(userId, (notification) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'notification',
          notification
        }));
      }
    });
    
    console.log(
      `✅ User ${currentUser.username} (${userId}) connected with session ${sessionId}`
    );
  } catch (error) {
    console.error("❌ Error during connection setup:", error);
    try {
      ws.close(1011, "Server error during connection setup");
    } catch (closeError) {
      console.error("Error closing connection:", closeError);
    }
    return;
  }

  ws.on("message", async (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());

      if (!message || typeof message !== "object") {
        throw new Error("Invalid message format");
      }

      if (!message.type) {
        throw new Error("Message type is required");
      }
    } catch (error) {
      console.error("Error parsing message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          text: "❌ Неверный формат сообщения",
        })
      );
      return;
    }

    try {
      switch (message.type) {
        case "setName":
          if (message.name && message.name.trim()) {
            const newName = message.name.trim().substring(0, 20);
            performance.startTimer('username_update');

            try {
              const oldName = currentUser.username;
              const result = await db.updateUsername(userId, newName);
              currentUser.username = result.username;

              // Аналитика
              analytics.track('username_changed', userId, { oldName, newName: result.username });
              
              // Уведомление
              notifications.notify(userId, {
                type: 'success',
                title: 'Имя изменено',
                message: `Ваше имя изменено на ${result.username}`
              });

              ws.send(JSON.stringify({
                type: "name_updated",
                userId: userId,
                newName: result.username,
              }));

              if (oldName !== result.username) {
                broadcast({
                  type: "action",
                  name: oldName,
                  text: `сменил имя на ${result.username}`,
                });
              }

              await broadcastUsers();
              ws.send(JSON.stringify({
                type: "system",
                text: `✅ Имя успешно установлено: ${result.username}`,
              }));
            } catch (error) {
              logger.error('Username update failed', { userId, newName, error: error.message });
              let errorMessage = "❌ Ошибка при изменении имени";
              if (error.code === "23505") {
                errorMessage = "❌ Это имя уже занято. Попробуйте другое.";
              }
              ws.send(JSON.stringify({ type: "system", text: errorMessage }));
            } finally {
              performance.endTimer('username_update');
            }
          }
          break;



        case "message":
          if (message.text && message.text.trim()) {
            const text = message.text.trim();
            
            // Проверка безопасности
            if (!security.checkRateLimit(userId, 20, 60000)) {
              ws.send(JSON.stringify({ type: "system", text: "❌ Слишком много сообщений" }));
              return;
            }
            
            if (!security.validateMessage(text)) {
              ws.send(JSON.stringify({ type: "system", text: "❌ Недопустимое содержимое" }));
              return;
            }

            if (text.length > 1000) {
              ws.send(
                JSON.stringify({
                  type: "system",
                  text: "❌ Сообщение слишком длинное (максимум 1000 символов)",
                })
              );
              return;
            }
            
            // Мониторинг и аналитика
            performance.startTimer('message_save');
            analytics.track('message_sent', userId, { length: text.length });
            logger.chatMessage(currentUser.username, text);

            const savedMessage = await db.saveMessage(userId, "message", text);
            const levelResult = await db.addExperience(userId, 1);
            performance.endTimer('message_save');
            
            broadcast({
              type: "message",
              id: userId,
              name: currentUser.username,
              text: text,
              ts: savedMessage.created_at,
            });
            
            if (levelResult.levelUp) {
              broadcast({
                type: "level_up",
                userId: userId,
                userName: currentUser.username,
                newLevel: levelResult.newLevel,
              });
            }
          }
          break;

        case "file":
          if (message.filename && message.data) {
            performance.startTimer('file_upload');
            try {
              // Проверка безопасности
              const validation = FileUtils.validateFile(message.filename, message.size, message.filetype);
              if (!validation.valid) {
                ws.send(JSON.stringify({ type: "system", text: `❌ ${validation.error}` }));
                return;
              }
              
              if (message.size > 10 * 1024 * 1024) {
                ws.send(JSON.stringify({
                  type: "system",
                  text: "❌ Файл слишком большой (максимум 10MB)",
                }));
                return;
              }

              const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
                "video/mp4",
                "video/webm",
                "video/ogg",
                // Добавьте эти аудио форматы:
                "audio/webm",
                "audio/webm;codecs=opus",
                "audio/ogg",
                "audio/ogg;codecs=opus",
                "audio/mp4",
                "audio/mpeg",
                "audio/wav",
                "audio/x-wav",
                "audio/aac",
                "audio/mp3",
                "application/pdf",
                "text/plain",
                "application/msword",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ];

              // Более гибкая проверка для аудио форматов
              const isAllowedType = allowedTypes.some((allowedType) => {
                if (
                  allowedType.includes("audio") &&
                  message.filetype.includes("audio")
                ) {
                  return true;
                }
                return message.filetype === allowedType;
              });

              if (!isAllowedType) {
                ws.send(
                  JSON.stringify({
                    type: "system",
                    text: "❌ Тип файла не поддерживается",
                  })
                );
                return;
              }

              // Аналитика
              analytics.track('file_uploaded', userId, { 
                filename: message.filename, 
                size: message.size, 
                type: message.filetype 
              });
              
              await db.saveFileMessage(
                userId,
                message.filename,
                message.filetype,
                message.size,
                message.data,
                null,
                message.duration
              );

              broadcast({
                type: "file",
                id: userId,
                name: currentUser.username,
                filename: message.filename,
                filetype: message.filetype,
                size: message.size,
                data: message.data,
                duration: message.duration,
                ts: Date.now(),
              });
            } catch (error) {
              logger.error('File upload failed', { userId, filename: message.filename, error: error.message });
              ws.send(JSON.stringify({
                type: "system",
                text: "❌ Ошибка при отправке файла",
              }));
            } finally {
              performance.endTimer('file_upload');
            }
          }
          break;

        case "action":
          if (message.text && message.text.trim()) {
            const text = message.text.trim();
            await db.saveMessage(userId, "action", text);
            broadcast({
              type: "action",
              name: currentUser.username,
              text: text,
            });
          }
          break;

        case "reaction":
          if (message.emoji) {
            await db.saveMessage(userId, "reaction", message.emoji);
            broadcast({
              type: "reaction",
              name: currentUser.username,
              emoji: message.emoji,
            });
          }
          break;

        case "sticker":
          if (message.stickerId) {
            const client = await pool.connect();
            try {
              const stickerResult = await client.query(
                'SELECT name, emoji FROM stickers WHERE id = $1',
                [message.stickerId]
              );
              
              if (stickerResult.rows[0]) {
                const sticker = stickerResult.rows[0];
                await db.saveMessage(userId, "sticker", `${sticker.name}:${sticker.emoji}`);
                broadcast({
                  type: "sticker",
                  name: currentUser.username,
                  sticker: sticker,
                });
              }
            } finally {
              client.release();
            }
          }
          break;

        case "create_poll":
          if (message.question && message.options && Array.isArray(message.options)) {
            const client = await pool.connect();
            try {
              const expiresAt = message.duration ? new Date(Date.now() + message.duration * 60000) : null;
              const result = await client.query(
                'INSERT INTO polls (creator_id, question, options, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
                [userId, message.question, JSON.stringify(message.options), expiresAt]
              );
              
              const poll = {
                id: result.rows[0].id,
                question: message.question,
                options: message.options,
                expiresAt: expiresAt,
                creatorId: userId,
                creatorName: currentUser.username
              };
              
              broadcast({
                type: "poll_created",
                poll: poll,
              });
              
              ws.send(JSON.stringify({
                type: "system",
                text: `✅ Опрос "${message.question}" создан!`
              }));
            } finally {
              client.release();
            }
          }
          break;

        case "poll_vote":
          if (message.pollId !== undefined && message.optionIndex !== undefined) {
            const client = await pool.connect();
            try {
              // Проверяем, существует ли опрос и не истек ли он
              const pollCheck = await client.query(
                'SELECT expires_at FROM polls WHERE id = $1',
                [message.pollId]
              );
              
              if (pollCheck.rows.length === 0) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Опрос не найден" }));
                return;
              }
              
              const poll = pollCheck.rows[0];
              if (poll.expires_at && new Date() > new Date(poll.expires_at)) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Опрос завершен" }));
                return;
              }
              
              // Проверяем, голосовал ли уже пользователь
              const existingVote = await client.query(
                'SELECT option_index FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
                [message.pollId, userId]
              );
              
              if (existingVote.rows.length > 0) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Вы уже голосовали в этом опросе" }));
                return;
              }
              
              // Добавляем голос
              await client.query(
                'INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES ($1, $2, $3)',
                [message.pollId, userId, message.optionIndex]
              );
              
              // Получаем актуальную статистику голосов
              const voteStats = await db.getPollVotes(message.pollId);
              
              broadcast({
                type: "poll_vote",
                pollId: message.pollId,
                userId: userId,
                userName: currentUser.username,
                optionIndex: message.optionIndex,
                voteStats: voteStats
              });
            } finally {
              client.release();
            }
          }
          break;

        case "create_game":
          if (message.gameType) {
            performance.startTimer('game_create');
            const client = await pool.connect();
            try {
              const result = await client.query(
                'INSERT INTO games (type, creator_id, data, status) VALUES ($1, $2, $3, $4) RETURNING id',
                [message.gameType, userId, JSON.stringify(message.gameData || {}), 'waiting']
              );
              
              const gameId = result.rows[0].id;
              await client.query(
                'INSERT INTO game_participants (game_id, user_id) VALUES ($1, $2)',
                [gameId, userId]
              );
              
              // Аналитика и логирование
              analytics.track('game_created', userId, { gameType: message.gameType, gameId });
              logger.gameAction(message.gameType, 'created', [currentUser.username]);
              
              broadcast({
                type: "game_created",
                gameId: gameId,
                gameType: message.gameType,
                creator: currentUser.username,
                creatorId: userId,
              });
              
              ws.send(JSON.stringify({
                type: "system",
                text: `✅ Игра "${message.gameType}" создана! ID: ${gameId}`
              }));
            } finally {
              client.release();
              performance.endTimer('game_create');
            }
          }
          break;

        case "join_game":
          if (message.gameId) {
            const client = await pool.connect();
            try {
              const gameCheck = await client.query(
                'SELECT g.*, COUNT(gp.user_id) as player_count FROM games g LEFT JOIN game_participants gp ON g.id = gp.game_id WHERE g.id = $1 GROUP BY g.id',
                [message.gameId]
              );
              
              if (gameCheck.rows.length === 0) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Игра не найдена" }));
                return;
              }
              
              const game = gameCheck.rows[0];
              if (game.status !== 'waiting') {
                ws.send(JSON.stringify({ type: "system", text: "❌ Игра уже началась" }));
                return;
              }
              
              const participantCheck = await client.query(
                'SELECT user_id FROM game_participants WHERE game_id = $1 AND user_id = $2',
                [message.gameId, userId]
              );
              
              if (participantCheck.rows.length > 0) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Вы уже участвуете" }));
                return;
              }
              
              await client.query(
                'INSERT INTO game_participants (game_id, user_id) VALUES ($1, $2)',
                [message.gameId, userId]
              );
              
              broadcast({
                type: "game_joined",
                gameId: message.gameId,
                userId: userId,
                userName: currentUser.username,
              });
              
              // Начинаем игру если достаточно игроков
              if (parseInt(game.player_count) + 1 >= 2) {
                await startGame(client, message.gameId, game.type);
              }
              
              ws.send(JSON.stringify({
                type: "system",
                text: `✅ Присоединились к игре #${message.gameId}`
              }));
            } finally {
              client.release();
            }
          }
          break;

        case "game_move":
          if (message.gameId && message.move) {
            await handleGameMove(message.gameId, userId, message.move);
          }
          break;

        case "leave_game":
          if (message.gameId) {
            const client = await pool.connect();
            try {
              await client.query(
                'DELETE FROM game_participants WHERE game_id = $1 AND user_id = $2',
                [message.gameId, userId]
              );
              
              broadcast({
                type: "system",
                text: `${currentUser.username} покинул игру`
              });
            } finally {
              client.release();
            }
          }
          break;

        case "create_tournament":
          if (message.name && message.gameType && message.maxPlayers) {
            const tournamentClient = await pool.connect();
            try {
              // Проверяем лимиты
              if (message.maxPlayers < 3 || message.maxPlayers > 16) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Количество игроков должно быть от 3 до 16" }));
                return;
              }
              
              const result = await tournamentClient.query(
                'INSERT INTO tournaments (name, game_type, creator_id, max_players, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [message.name, message.gameType, userId, message.maxPlayers, 'waiting']
              );
              
              const tournamentId = result.rows[0].id;
              await tournamentClient.query(
                'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
                [tournamentId, userId]
              );
              
              analytics.track('tournament_created', userId, { 
                tournamentId, 
                gameType: message.gameType, 
                maxPlayers: message.maxPlayers 
              });
              
              broadcast({
                type: 'tournament_created',
                tournament: {
                  id: tournamentId,
                  name: message.name,
                  gameType: message.gameType,
                  maxPlayers: message.maxPlayers,
                  participants: 1,
                  creatorName: currentUser.username,
                  status: 'waiting',
                  rounds: [],
                  currentRound: 0
                }
              });
              
              ws.send(JSON.stringify({
                type: 'system',
                text: `🏆 Турнир "${message.name}" создан! Ожидаем игроков...`
              }));
            } finally {
              tournamentClient.release();
            }
          }
          break;

        case "join_tournament":
          if (message.tournamentId) {
            const tournamentClient = await pool.connect();
            try {
              const tournamentCheck = await tournamentClient.query(
                'SELECT t.*, COUNT(tp.user_id) as participant_count FROM tournaments t LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id WHERE t.id = $1 GROUP BY t.id',
                [message.tournamentId]
              );
              
              if (tournamentCheck.rows.length === 0) {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Турнир не найден' }));
                return;
              }
              
              const tournament = tournamentCheck.rows[0];
              if (tournament.status !== 'waiting') {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Турнир уже начался' }));
                return;
              }
              
              if (parseInt(tournament.participant_count) >= tournament.max_players) {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Турнир заполнен' }));
                return;
              }
              
              const participantCheck = await tournamentClient.query(
                'SELECT user_id FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2',
                [message.tournamentId, userId]
              );
              
              if (participantCheck.rows.length > 0) {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Вы уже участвуете' }));
                return;
              }
              
              await tournamentClient.query(
                'INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)',
                [message.tournamentId, userId]
              );
              
              const newCount = parseInt(tournament.participant_count) + 1;
              
              broadcast({
                type: 'tournament_joined',
                tournamentId: message.tournamentId,
                userId: userId,
                userName: currentUser.username,
                participants: newCount,
                maxPlayers: tournament.max_players
              });
              
              // Автоматический старт при достижении минимума игроков
              if (newCount >= Math.max(3, Math.ceil(tournament.max_players * 0.75))) {
                await startTournament(tournamentClient, message.tournamentId, tournament);
              }
              
              ws.send(JSON.stringify({
                type: 'system',
                text: `✅ Вы присоединились к турниру "${tournament.name}" (${newCount}/${tournament.max_players})`
              }));
            } finally {
              tournamentClient.release();
            }
          }
          break;

        case "add_friend":
          if (message.targetUserId) {
            const friendClient = await pool.connect();
            try {
              const existingFriendship = await friendClient.query(
                'SELECT * FROM friendships WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
                [userId, message.targetUserId]
              );
              
              if (existingFriendship.rows.length > 0) {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Заявка уже отправлена или вы уже друзья' }));
                return;
              }
              
              await friendClient.query(
                'INSERT INTO friendships (user1_id, user2_id, status) VALUES ($1, $2, $3)',
                [userId, message.targetUserId, 'pending']
              );
              
              const targetClient = Array.from(clients.values()).find(
                client => client.userId === message.targetUserId
              );
              
              if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                targetClient.ws.send(JSON.stringify({
                  type: 'friend_request',
                  fromUserId: userId,
                  fromUserName: currentUser.username
                }));
              }
              
              ws.send(JSON.stringify({ type: 'system', text: '✅ Заявка в друзья отправлена' }));
            } finally {
              friendClient.release();
            }
          }
          break;

        case "accept_friend":
          if (message.targetUserId) {
            const acceptClient = await pool.connect();
            try {
              await acceptClient.query(
                'UPDATE friendships SET status = $1 WHERE user1_id = $2 AND user2_id = $3 AND status = $4',
                ['accepted', message.targetUserId, userId, 'pending']
              );
              
              const targetClient = Array.from(clients.values()).find(
                client => client.userId === message.targetUserId
              );
              
              if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                targetClient.ws.send(JSON.stringify({
                  type: 'friend_request_accepted',
                  byUserId: userId,
                  byUserName: currentUser.username
                }));
              }
              
              ws.send(JSON.stringify({ type: 'system', text: '✅ Заявка принята' }));
            } finally {
              acceptClient.release();
            }
          }
          break;

        case "get_stickers":
          const client = await pool.connect();
          try {
            const result = await client.query(
              'SELECT id, name, emoji, category FROM stickers ORDER BY category, name'
            );
            
            ws.send(
              JSON.stringify({
                type: "stickers_list",
                stickers: result.rows,
              })
            );
          } finally {
            client.release();
          }
          break;

        case "get_user_level":
          const levelClient = await pool.connect();
          try {
            const result = await levelClient.query(
              'SELECT level, experience, messages_count, games_won, achievements FROM user_levels WHERE user_id = $1',
              [userId]
            );
            
            const userLevel = result.rows[0] || {
              level: 1,
              experience: 0,
              messages_count: 0,
              games_won: 0,
              achievements: []
            };
            
            ws.send(
              JSON.stringify({
                type: "user_level",
                level: userLevel,
              })
            );
          } finally {
            levelClient.release();
          }
          break;

        case "create_private_room":
          if (message.name) {
            const roomClient = await pool.connect();
            try {
              const result = await roomClient.query(
                'INSERT INTO private_rooms (name, creator_id, password_hash) VALUES ($1, $2, $3) RETURNING id',
                [message.name, userId, message.password || null]
              );
              
              const roomId = result.rows[0].id;
              analytics.track('private_room_created', userId, { roomName: message.name });
              
              ws.send(JSON.stringify({
                type: 'private_room_created',
                roomId: roomId,
                name: message.name
              }));
              
              broadcast({
                type: 'system',
                text: `🏠 ${currentUser.username} создал приватную комнату "${message.name}"`
              });
            } finally {
              roomClient.release();
            }
          }
          break;

        case "join_private_room":
          if (message.roomId) {
            const roomClient = await pool.connect();
            try {
              const roomResult = await roomClient.query(
                'SELECT * FROM private_rooms WHERE id = $1',
                [message.roomId]
              );
              
              if (roomResult.rows.length === 0) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Комната не найдена" }));
                return;
              }
              
              const room = roomResult.rows[0];
              
              // Проверяем пароль если есть
              if (room.password_hash && room.password_hash !== (message.password || '')) {
                ws.send(JSON.stringify({ type: "system", text: "❌ Неверный пароль" }));
                return;
              }
              
              analytics.track('private_room_joined', userId, { roomId: message.roomId });
              logger.userAction(currentUser.username, 'private_room_joined', { roomId: message.roomId, roomName: room.name });
              
              ws.send(JSON.stringify({
                type: 'private_room_joined',
                roomId: message.roomId,
                roomName: room.name
              }));
            } finally {
              roomClient.release();
            }
          }
          break;

        case "get_private_rooms":
          const roomsClient = await pool.connect();
          try {
            const result = await roomsClient.query(`
              SELECT pr.id, pr.name, pr.created_at, u.username as creator,
                     CASE WHEN pr.password_hash IS NOT NULL THEN true ELSE false END as has_password
              FROM private_rooms pr
              JOIN users u ON pr.creator_id = u.id
              ORDER BY pr.created_at DESC
              LIMIT 20
            `);
            
            ws.send(JSON.stringify({
              type: 'private_rooms_list',
              rooms: result.rows
            }));
          } finally {
            roomsClient.release();
          }
          break;



        case "get_friends":
          const friendsClient = await pool.connect();
          try {
            // Получаем список друзей
            const result = await friendsClient.query(`
              SELECT DISTINCT u.id, u.username, u.avatar_url, u.status
              FROM users u
              LEFT JOIN friendships f ON (f.user1_id = u.id AND f.user2_id = $1) OR (f.user2_id = u.id AND f.user1_id = $1)
              WHERE u.id != $1 AND (f.status = 'accepted' OR f.status IS NULL)
              ORDER BY u.username
              LIMIT 20
            `, [userId]);
            
            // Добавляем статус онлайн
            const friendsWithStatus = result.rows.map(user => ({
              ...user,
              is_online: Array.from(clients.values()).some(c => c.userId === user.id),
              friendship_status: 'none' // Упрощенно для демо
            }));
            
            ws.send(JSON.stringify({
              type: 'friends_list',
              friends: friendsWithStatus
            }));
          } finally {
            friendsClient.release();
          }
          break;

        case "get_tournaments":
          const tournamentsClient = await pool.connect();
          try {
            const result = await tournamentsClient.query(`
              SELECT t.id, t.name, t.game_type, t.max_players, t.status, t.created_at,
                     u.username as creator_name,
                     COUNT(tp.user_id) as participant_count
              FROM tournaments t
              JOIN users u ON t.creator_id = u.id
              LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
              WHERE t.status IN ('waiting', 'started')
              GROUP BY t.id, u.username
              ORDER BY t.created_at DESC
              LIMIT 10
            `);
            
            ws.send(JSON.stringify({
              type: 'tournaments_list',
              tournaments: result.rows
            }));
          } finally {
            tournamentsClient.release();
          }
          break;

        case "start_tournament_manually":
          if (message.tournamentId) {
            const tournamentClient = await pool.connect();
            try {
              const tournament = await tournamentClient.query(
                'SELECT * FROM tournaments WHERE id = $1 AND creator_id = $2 AND status = $3',
                [message.tournamentId, userId, 'waiting']
              );
              
              if (tournament.rows.length === 0) {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Турнир не найден или вы не создатель' }));
                return;
              }
              
              const participantCount = await tournamentClient.query(
                'SELECT COUNT(*) as count FROM tournament_participants WHERE tournament_id = $1',
                [message.tournamentId]
              );
              
              if (parseInt(participantCount.rows[0].count) < 3) {
                ws.send(JSON.stringify({ type: 'system', text: '❌ Минимум 3 игрока для старта турнира' }));
                return;
              }
              
              await startTournament(tournamentClient, message.tournamentId, tournament.rows[0]);
              
              ws.send(JSON.stringify({
                type: 'system',
                text: `🏆 Турнир "${tournament.rows[0].name}" запущен!`
              }));
            } finally {
              tournamentClient.release();
            }
          }
          break;

        case "tournament_action":
          if (message.tournamentId && message.action) {
            await handleTournamentAction(message.tournamentId, userId, message.action, message.data);
          }
          break;

        case "screen_share_start":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            room.screenSharer = { userId, userName: currentUser.username, sessionId };
            
            analytics.track('screen_share_started', userId, { roomId: message.roomId });
            logger.userAction(currentUser.username, 'screen_share_started', { roomId: message.roomId });
            
            broadcastToRoom(message.roomId, {
              type: 'screen_share_started',
              sharerUserId: userId,
              sharerUserName: currentUser.username,
              roomId: message.roomId
            }, sessionId);
            
            ws.send(JSON.stringify({
              type: 'system',
              text: '✅ Показ экрана начат'
            }));
          }
          break;

        case "screen_share_stop":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            if (room.screenSharer && room.screenSharer.userId === userId) {
              delete room.screenSharer;
              
              analytics.track('screen_share_stopped', userId, { roomId: message.roomId });
              logger.userAction(currentUser.username, 'screen_share_stopped', { roomId: message.roomId });
              
              broadcastToRoom(message.roomId, {
                type: 'screen_share_stopped',
                sharerUserId: userId,
                roomId: message.roomId
              });
              
              ws.send(JSON.stringify({
                type: 'system',
                text: '✅ Показ экрана остановлен'
              }));
            }
          }
          break;

        case "screen_share_data":
          if (message.roomId && message.data && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            if (room.screenSharer && room.screenSharer.userId === userId) {
              // Отправляем данные экрана всем участникам комнаты кроме отправителя
              broadcastToRoom(message.roomId, {
                type: 'screen_share_data',
                data: message.data,
                sharerUserId: userId,
                roomId: message.roomId
              }, sessionId);
            }
          }
          break;

        case "private":
          if (message.to && message.text && message.text.trim()) {
            const targetUser = await db.getUserById(message.to);
            if (targetUser) {
              const text = message.text.trim();
              await db.saveMessage(userId, "private", text, message.to);

              let targetClient = null;
              clients.forEach((client, sid) => {
                if (client.userId === message.to) {
                  targetClient = client;
                }
              });

              if (
                targetClient &&
                targetClient.ws.readyState === WebSocket.OPEN
              ) {
                targetClient.ws.send(
                  JSON.stringify({
                    type: "private",
                    name: currentUser.username,
                    text: text,
                    fromUserId: userId,
                  })
                );

                ws.send(JSON.stringify({ type: "private_sent" }));
              } else {
                ws.send(
                  JSON.stringify({
                    type: "system",
                    text: "❌ Пользователь не в сети",
                  })
                );
              }
            }
          }
          break;

        // WebRTC сигнальные сообщения
        case "create_room":
          const roomId = `room_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          rooms.set(roomId, {
            users: new Map([
              [
                sessionId,
                {
                  userId,
                  userName: currentUser.username,
                  sessionId: sessionId,
                },
              ],
            ]),
            creator: sessionId,
            createdAt: Date.now(),
            isGroupCall: true,
            isActive: true, // ДОБАВИТЬ: флаг активного звонка
          });

          console.log(`📞 Room created: ${roomId} by ${currentUser.username}`);

          // Отправляем создателю подтверждение
          ws.send(
            JSON.stringify({
              type: "room_created",
              roomId: roomId,
              message: "Групповой звонок создан. Ожидаем участников...",
            })
          );

          // НЕ отправляем приглашение всем сразу - вместо этого уведомляем о создании комнаты
          broadcast(
            {
              type: "group_call_started",
              roomId: roomId,
              fromUserId: userId,
              fromUserName: currentUser.username,
            },
            sessionId
          );
          break;

        case "join_group_call":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);

            if (!room.isActive) {
              ws.send(
                JSON.stringify({
                  type: "system",
                  text: "❌ Этот звонок уже завершен",
                })
              );
              break;
            }

            if (!room.users.has(sessionId)) {
              room.users.set(sessionId, {
                userId,
                userName: currentUser.username,
                sessionId: sessionId,
              });

              console.log(
                `👤 User ${currentUser.username} joined group call ${message.roomId}`
              );

              // Отправляем новому участнику полный список пользователей
              const usersInRoom = Array.from(room.users.entries()).map(
                ([sid, user]) => ({
                  sessionId: sid,
                  userId: user.userId,
                  userName: user.userName,
                })
              );

              ws.send(
                JSON.stringify({
                  type: "room_users",
                  users: usersInRoom,
                  roomId: message.roomId,
                })
              );

              // ИСПРАВЛЕНИЕ: Оповещаем всех участников о новом пользователе
              broadcastToRoom(
                message.roomId,
                {
                  type: "user_joined",
                  userId: userId,
                  userName: currentUser.username,
                  roomId: message.roomId,
                  sessionId: sessionId,
                },
                sessionId // исключаем нового пользователя из этого сообщения
              );

              // ИСПРАВЛЕНИЕ: Отправляем обновленный список всем участникам
              broadcastToRoom(message.roomId, {
                type: "room_users",
                users: usersInRoom,
                roomId: message.roomId,
              });

              // Уведомляем о присоединении
              broadcastToRoom(message.roomId, {
                type: "system",
                text: `👤 ${currentUser.username} присоединился к звонку`,
              });
            }
          } else {
            ws.send(
              JSON.stringify({
                type: "system",
                text: "❌ Звонок не найден или уже завершен",
              })
            );
          }
          break;

        case "start_individual_call":
          if (message.targetUserId) {
            const targetClient = Array.from(clients.values()).find(
              (client) => client.userId === message.targetUserId
            );
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
              const roomId = `room_${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 9)}`;
              rooms.set(roomId, {
                users: new Map([
                  [
                    sessionId,
                    {
                      userId,
                      userName: currentUser.username,
                      sessionId: sessionId,
                    },
                  ],
                ]),
                creator: sessionId,
                createdAt: Date.now(),
                isGroupCall: false,
                isActive: true, // ДОБАВЬТЕ ЭТУ СТРОЧКУ
              });

              console.log(
                `📞 Individual call room created: ${roomId} by ${currentUser.username}`
              );

              // Сначала отправляем подтверждение инициатору
              ws.send(
                JSON.stringify({
                  type: "call_started", // УБЕДИТЕСЬ ЧТО ТИП call_started
                  roomId: roomId,
                  targetUserName: targetClient.user.username,
                  message: `Вызываем ${targetClient.user.username}...`,
                })
              );

              // Затем отправляем приглашение целевому пользователю
              targetClient.ws.send(
                JSON.stringify({
                  type: "call_invite",
                  fromUserId: userId,
                  fromUserName: currentUser.username,
                  roomId: roomId,
                  isGroupCall: false,
                })
              );
            } else {
              ws.send(
                JSON.stringify({
                  type: "system",
                  text: "❌ Пользователь не в сети",
                })
              );
            }
          }
          break;

        // В обработчике сообщения "join_room" добавьте:
        case "join_room":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            if (!room.users.has(sessionId)) {
              room.users.set(sessionId, {
                userId,
                userName: currentUser.username,
                sessionId: sessionId,
              });

              console.log(
                `👤 User ${currentUser.username} joined room ${message.roomId}`
              );

              // ИСПРАВЛЕНИЕ: Сразу отправляем полный список пользователей новому участнику
              const usersInRoom = Array.from(room.users.entries()).map(
                ([sid, user]) => ({
                  sessionId: sid,
                  userId: user.userId,
                  userName: user.userName,
                })
              );

              // Отправляем новому участнику полный список
              ws.send(
                JSON.stringify({
                  type: "room_users",
                  users: usersInRoom,
                  roomId: message.roomId,
                })
              );

              // Оповещаем всех о новом участнике
              broadcastToRoom(
                message.roomId,
                {
                  type: "user_joined",
                  userId: userId,
                  userName: currentUser.username,
                  roomId: message.roomId,
                  sessionId: sessionId,
                },
                sessionId
              );

              // ИСПРАВЛЕНИЕ: Отправляем обновленный список всем участникам
              broadcastToRoom(message.roomId, {
                type: "room_users",
                users: usersInRoom,
                roomId: message.roomId,
              });
            }
          }
          break;

        case "get_room_users":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            const usersInRoom = Array.from(room.users.entries()).map(
              ([sid, user]) => ({
                sessionId: sid,
                userId: user.userId,
                userName: user.userName,
              })
            );

            ws.send(
              JSON.stringify({
                type: "room_users",
                users: usersInRoom,
                roomId: message.roomId,
              })
            );
          }
          break;

        case "webrtc_offer":
          if (message.targetSessionId && message.offer) {
            const targetClient = clients.get(message.targetSessionId);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(JSON.stringify({
                type: "webrtc_offer",
                fromSessionId: sessionId,
                fromUserId: userId,
                roomId: message.roomId,
                offer: message.offer
              }));
            }
          }
          break;

        case "webrtc_answer":
          if (message.targetSessionId && message.answer) {
            const targetClient = clients.get(message.targetSessionId);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(JSON.stringify({
                type: "webrtc_answer",
                fromSessionId: sessionId,
                fromUserId: userId,
                roomId: message.roomId,
                answer: message.answer
              }));
            }
          }
          break;

        case "webrtc_ice_candidate":
          if (message.targetSessionId && message.candidate) {
            const targetClient = clients.get(message.targetSessionId);
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(JSON.stringify({
                type: "webrtc_ice_candidate",
                fromSessionId: sessionId,
                fromUserId: userId,
                roomId: message.roomId,
                candidate: message.candidate
              }));
            }
          }
          break;

        case "leave_room":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            const userName = currentUser.username;
            
            // Останавливаем показ экрана если этот пользователь его показывал
            if (room.screenSharer && room.screenSharer.userId === userId) {
              delete room.screenSharer;
              broadcastToRoom(message.roomId, {
                type: 'screen_share_stopped',
                sharerUserId: userId,
                roomId: message.roomId
              });
            }

            room.users.delete(sessionId);
            analytics.track('room_left', userId, { roomId: message.roomId });

            console.log(`👤 User ${userName} left room ${message.roomId}`);

            broadcastToRoom(
              message.roomId,
              {
                type: "user_left",
                userId: userId,
                userName: userName,
                roomId: message.roomId,
                sessionId: sessionId,
              },
              sessionId
            );

            if (room.users.size > 0) {
              const usersInRoom = Array.from(room.users.entries()).map(
                ([sid, user]) => ({
                  sessionId: sid,
                  userId: user.userId,
                  userName: user.userName,
                })
              );

              broadcastToRoom(message.roomId, {
                type: "room_users",
                users: usersInRoom,
                roomId: message.roomId,
              });
            } else {
              rooms.delete(message.roomId);
              console.log(`🗑️ Room ${message.roomId} deleted (no users)`);
            }
          }
          break;

        case "call_rejected":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);
            const caller = clients.get(room.creator);
            if (caller && caller.ws.readyState === WebSocket.OPEN) {
              caller.ws.send(
                JSON.stringify({
                  type: "call_rejected",
                  roomId: message.roomId,
                  userName: currentUser.username,
                })
              );
            }
            // Удаляем комнату если это индивидуальный звонок
            if (!room.isGroupCall) {
              rooms.delete(message.roomId);
              console.log(
                `🗑️ Individual call room ${message.roomId} deleted (rejected)`
              );
            }
          }
          break;

        case "get_active_calls":
          const activeCalls = Array.from(rooms.entries())
            .filter(([roomId, room]) => room.isActive && room.isGroupCall)
            .map(([roomId, room]) => ({
              roomId,
              creatorName: room.users.get(room.creator)?.userName || "Unknown",
              participantsCount: room.users.size,
              createdAt: room.createdAt,
            }));

          ws.send(
            JSON.stringify({
              type: "active_calls",
              calls: activeCalls,
            })
          );
          break;

        case "end_call":
          if (message.roomId && rooms.has(message.roomId)) {
            const room = rooms.get(message.roomId);

            // Помечаем комнату как неактивную
            room.isActive = false;

            broadcastToRoom(message.roomId, {
              type: "call_ended",
              roomId: message.roomId,
              endedBy: currentUser.username,
            });

            // Уведомляем всех о завершении звонка
            broadcast({
              type: "group_call_ended",
              roomId: message.roomId,
              endedBy: currentUser.username,
            });

            // Удаляем комнату через некоторое время
            setTimeout(() => {
              if (rooms.has(message.roomId)) {
                rooms.delete(message.roomId);
                console.log(`🗑️ Room ${message.roomId} deleted after call end`);
              }
            }, 30000); // 30 секунд для завершения всех соединений

            console.log(
              `📞 Call ended in room ${message.roomId} by ${currentUser.username}`
            );
          }
          break;

        default:
          console.log("❌ Unknown message type:", message.type);
          ws.send(
            JSON.stringify({
              type: "error",
              text: "❌ Неизвестный тип сообщения",
            })
          );
      }
    } catch (error) {
      console.error("❌ Error processing message:", error);
      try {
        ws.send(
          JSON.stringify({
            type: "system",
            text: "❌ Ошибка обработки сообщения",
          })
        );
      } catch (sendError) {
        console.error("Error sending error message:", sendError);
      }
    }
  });

  ws.on("close", async (code, reason) => {
    console.log(
      `🔌 WebSocket connection closed: ${sessionId} (user: ${currentUser?.username})`,
      code,
      reason?.toString()
    );

    // ИСПРАВЛЕНИЕ: Не обрабатываем как ошибку закрытие дублирующих сессий
    if (
      code === 4000 &&
      reason === "Duplicate session closed by new connection"
    ) {
      console.log(`🔄 Duplicate session ${sessionId} closed normally`);
      clients.delete(sessionId);
      return;
    }

    try {
      // Удаляем из комнат
      rooms.forEach((room, roomId) => {
        if (room.users.has(sessionId)) {
          const userName = currentUser?.username || "Unknown";
          room.users.delete(sessionId);

          try {
            broadcastToRoom(
              roomId,
              {
                type: "user_left",
                userId: userId,
                userName: userName,
                roomId: roomId,
                sessionId: sessionId,
              },
              sessionId
            );

            // Обновляем список пользователей для оставшихся участников
            if (room.users.size > 0) {
              const usersInRoom = Array.from(room.users.entries()).map(
                ([sid, user]) => ({
                  sessionId: sid,
                  userId: user.userId,
                  userName: user.userName,
                })
              );

              broadcastToRoom(roomId, {
                type: "room_users",
                users: usersInRoom,
                roomId: roomId,
              });
            } else {
              rooms.delete(roomId);
            }
          } catch (error) {
            console.error("Error broadcasting user left:", error);
          }
        }
      });

      const clientData = clients.get(sessionId);
      if (clientData && currentUser) {
        // Отписываемся от уведомлений
        notifications.unsubscribe(userId);
        
        // Аналитика
        analytics.track('user_disconnected', userId, { username: currentUser.username });
        logger.userAction(currentUser.username, 'disconnected', { sessionId });
        
        await db.endUserSession(sessionId);
        clients.delete(sessionId);
        await db.saveMessage(
          userId,
          "system",
          `${currentUser.username} вышел из чат`
        );
        broadcast({
          type: "system",
          text: `🐱 ${currentUser.username} вышел из чата`,
        });
        await broadcastUsers();

        // Попробуем удалить временного пользователя, если он больше не используется
        try {
          await db.deleteTemporaryUserIfUnused(userId);
        } catch (err) {
          console.error("Error attempting to delete temporary user:", err);
        }

        console.log(
          `✅ User ${currentUser.username} (${userId}) disconnected, session ${sessionId} removed`
        );
      }
    } catch (error) {
      console.error("❌ Error during connection cleanup:", error);
    }
  });

  ws.on("error", (error) => {
    console.error(
      "❌ WebSocket error for session",
      sessionId,
      "user:",
      currentUser?.username,
      "error:",
      error
    );
  });
});

// Улучшенная очистка старых сессий и временных пользователей
async function cleanupOldSessions() {
  try {
    const client = await pool.connect();

    // Закрываем сессии в базе данных старше 1 часа
    await client.query(`
      UPDATE user_sessions SET disconnected_at = CURRENT_TIMESTAMP 
      WHERE disconnected_at IS NULL AND connected_at < NOW() - INTERVAL '1 hour'
    `);

    // Очищаем неиспользуемых временных пользователей
    const cleanedUsers = await db.cleanupAllUnusedTemporaryUsers();
    if (cleanedUsers.length > 0) {
      console.log(
        `🧹 Cleaned up ${cleanedUsers.length} temporary users:`,
        cleanedUsers
      );
    }

    // Закрываем соединения в памяти для пользователей с неактивными сессиями
    clients.forEach((clientData, sessionId) => {
      // Если соединение закрыто, но все еще в памяти - удаляем
      if (clientData.ws.readyState !== WebSocket.OPEN) {
        clients.delete(sessionId);
        console.log(`🧹 Removed closed connection from memory: ${sessionId}`);
      }
    });

    // Очищаем пустые комнаты (старше 1 часа)
    const now = Date.now();
    rooms.forEach((room, roomId) => {
      if (room.users.size === 0 && now - room.createdAt > 3600000) {
        rooms.delete(roomId);
        console.log(`🧹 Removed empty room: ${roomId}`);
      }
    });

    client.release();
    console.log("🧹 Old sessions and temporary users cleaned up");
  } catch (error) {
    console.error("Error cleaning up old sessions:", error);
  }
}

setInterval(cleanupOldSessions, 10 * 60 * 1000); // Каждые 10 минут

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await db.init();
    await cleanupOldSessions();
    
    // Запускаем автобэкап
    backupManager.startAutoBackup();
    
    // Очистка старых логов при запуске
    logger.cleanOldLogs(7);
    
    // Настраиваем планировщик задач
    scheduler.schedule('cache_cleanup', () => {
      cache.cleanup();
      logger.info('Cache cleanup completed', { size: cache.size() });
    }, 30 * 60 * 1000);
    
    scheduler.schedule('security_cleanup', () => {
      security.cleanup();
      analytics.cleanup();
    }, 60 * 60 * 1000);
    
    scheduler.schedule('performance_check', () => {
      const system = performance.getSystemInfo();
      if (system.memory.heapUsed > 500) {
        logger.warn('High memory usage detected', system);
      }
    }, 5 * 60 * 1000);
    
    server.listen(PORT, () => {
      logger.systemEvent('Server started', { port: PORT });
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 WebSocket server ready for connections`);
      console.log(`❤️  Health check available at http://localhost:${PORT}/health`);
      console.log(`💾 Database connection established`);
      console.log(`🛠️  New utilities loaded: Cache, Backup, Stats, Logger`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}



function gracefulShutdown() {
  console.log("🔄 Starting graceful shutdown...");
  logger.systemEvent('Server shutdown initiated');

  // Останавливаем планировщик
  scheduler.stop();
  console.log("✅ Task scheduler stopped");

  // Очищаем алерты
  performance.clearAlerts();
  
  // Создаем финальный бэкап
  backupManager.createBackup().then(() => {
    console.log("✅ Final backup created");
  }).catch(err => {
    console.error("❌ Final backup failed:", err);
  });

  wss.close(() => {
    console.log("✅ WebSocket server closed");
  });

  clients.forEach((client, sessionId) => {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1001, "Server shutdown");
      }
    } catch (error) {
      console.error("Error closing client connection:", error);
    }
  });

  pool.end(() => {
    logger.systemEvent('Database connection closed');
    console.log("✅ Database pool closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    console.log("⚠️ Forced shutdown");
    process.exit(1);
  }, 15000); // Увеличиваем время для бэкапа
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  gracefulShutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown();
});

startServer();