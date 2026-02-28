#!/usr/bin/env node

const fs = require('fs');

console.log('🔧 Проверка AI настроек...\n');

// Проверяем .env файл
if (!fs.existsSync('.env')) {
  console.log('❌ Файл .env не найден');
  console.log('Создайте файл .env и добавьте:');
  console.log('OPENAI_API_KEY=sk-ваш-ключ-здесь');
  process.exit(1);
}

const envContent = fs.readFileSync('.env', 'utf8');
const hasOpenAI = envContent.includes('OPENAI_API_KEY=sk-');

if (!hasOpenAI) {
  console.log('❌ OpenAI API ключ не найден в .env');
  console.log('Добавьте в .env файл:');
  console.log('OPENAI_API_KEY=sk-ваш-полный-ключ');
} else {
  console.log('✅ OpenAI API ключ найден');
  
  // Извлекаем ключ для проверки
  const keyMatch = envContent.match(/OPENAI_API_KEY=(sk-[^\s\n]+)/);
  if (keyMatch) {
    const key = keyMatch[1];
    console.log(`🔑 Ключ: ${key.substring(0, 10)}...${key.slice(-4)}`);
    
    if (key.length < 40) {
      console.log('⚠️ Ключ кажется неполным (слишком короткий)');
    }
  }
}

console.log('\n📋 Для работы AI:');
console.log('1. Получите ключ на https://platform.openai.com/api-keys');
console.log('2. Добавьте в .env: OPENAI_API_KEY=sk-ваш-ключ');
console.log('3. Перезапустите сервер: npm start');