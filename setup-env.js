#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('⚙️ Настройка переменных окружения\n');

function askQuestion(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const envData = {};
  
  console.log('Настройка API ключей (нажмите Enter для пропуска):\n');
  
  // OpenAI
  const openaiKey = await askQuestion('OpenAI API ключ (sk-...): ');
  if (openaiKey.trim()) envData.OPENAI_API_KEY = openaiKey.trim();
  
  // Database
  const dbUrl = await askQuestion('Database URL (postgresql://...): ');
  if (dbUrl.trim()) envData.DATABASE_URL = dbUrl.trim();
  
  // VAPID keys
  console.log('\n🔑 Генерирую VAPID ключи...');
  try {
    const webpush = require('web-push');
    const vapidKeys = webpush.generateVAPIDKeys();
    envData.VAPID_PUBLIC_KEY = vapidKeys.publicKey;
    envData.VAPID_PRIVATE_KEY = vapidKeys.privateKey;
    console.log('✅ VAPID ключи сгенерированы');
  } catch (error) {
    console.log('⚠️ Установите web-push: npm install web-push');
  }
  
  // Port
  const port = await askQuestion('Порт сервера (3000): ');
  envData.PORT = port.trim() || '3000';
  envData.NODE_ENV = 'development';
  
  // Create .env file
  let envContent = '';
  for (const [key, value] of Object.entries(envData)) {
    envContent += `${key}=${value}\n`;
  }
  
  fs.writeFileSync('.env', envContent);
  console.log('\n✅ Файл .env создан!');
  console.log('\n📄 Содержимое:');
  console.log(envContent);
  
  rl.close();
}

main().catch(console.error);