#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔑 Добавление OpenAI API ключа\n');

rl.question('Вставьте ваш полный API ключ: ', (key) => {
  if (!key.startsWith('sk-')) {
    console.log('❌ Ключ должен начинаться с "sk-"');
    rl.close();
    return;
  }
  
  // Читаем существующий .env или создаем новый
  let envContent = '';
  if (fs.existsSync('.env')) {
    envContent = fs.readFileSync('.env', 'utf8');
  }
  
  // Удаляем старый ключ если есть
  envContent = envContent.replace(/OPENAI_API_KEY=.*/g, '');
  
  // Добавляем новый ключ
  envContent += `\nOPENAI_API_KEY=${key}\n`;
  
  // Сохраняем
  fs.writeFileSync('.env', envContent);
  
  console.log('✅ API ключ добавлен в .env файл');
  console.log('🔄 Перезапустите сервер для применения изменений');
  
  rl.close();
});