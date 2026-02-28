-- database.sql
-- Создание базы данных и таблиц с играми, уровнями, стикерами и опросами

CREATE DATABASE chat_app;

\c chat_app;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_temporary BOOLEAN DEFAULT false,
    avatar_url TEXT,
    bio TEXT,
    status VARCHAR(140),
    -- Система уровней
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    achievements TEXT[],
    title VARCHAR(100) DEFAULT 'Новичок'
);

CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    message_type VARCHAR(20) NOT NULL, -- 'message', 'system', 'action', 'reaction', 'private', 'game', 'sticker', 'poll'
    content TEXT NOT NULL, 
    target_user_id INTEGER REFERENCES users(id), -- для приватных сообщений
    file_name VARCHAR(255),
    file_type VARCHAR(100),
    file_size INTEGER,
    file_data BYTEA,
    voice_duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id VARCHAR(100) UNIQUE NOT NULL,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    disconnected_at TIMESTAMP NULL
);

-- Игры в чате
CREATE TABLE chat_games (
    id SERIAL PRIMARY KEY,
    game_type VARCHAR(50) NOT NULL, -- 'word_chain', 'guess_number', 'quiz', 'tic_tac_toe'
    creator_id INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'waiting', -- 'waiting', 'active', 'finished'
    game_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL
);

CREATE TABLE game_participants (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES chat_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    score INTEGER DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);

-- Стикеры и мемы
CREATE TABLE stickers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    file_type VARCHAR(10) NOT NULL,
    file_data BYTEA NOT NULL,
    is_premium BOOLEAN DEFAULT false,
    cost INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_stickers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sticker_id INTEGER REFERENCES stickers(id) ON DELETE CASCADE,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sticker_id)
);

-- Опросы и голосования
CREATE TABLE polls (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES users(id),
    question TEXT NOT NULL,
    options JSONB NOT NULL, -- массив вариантов
    multiple_choice BOOLEAN DEFAULT false,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE poll_votes (
    id SERIAL PRIMARY KEY,
    poll_id INTEGER REFERENCES polls(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    option_index INTEGER NOT NULL,
    voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poll_id, user_id)
);

-- Уведомления
CREATE TABLE user_fcm_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    fcm_token VARCHAR(500) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_chat_games_status ON chat_games(status);
CREATE INDEX idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX idx_stickers_category ON stickers(category);
CREATE INDEX idx_polls_creator_id ON polls(creator_id);
CREATE INDEX idx_poll_votes_poll_id ON poll_votes(poll_id);