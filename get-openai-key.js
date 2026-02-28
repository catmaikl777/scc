#!/usr/bin/env node

const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🤖 Получение OpenAI API ключа\n');

function askQuestion(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('Варианты получения API ключа:\n');
  console.log('1. Автоматически через браузер');
  console.log('2. Инструкции для ручного получения');
  console.log('3. Проверить существующий ключ\n');
  
  const choice = await askQuestion('Выберите вариант (1-3): ');
  
  switch(choice) {
    case '1':
      console.log('\n🌐 Открываю OpenAI Platform...');
      const { exec } = require('child_process');
      exec('start https://platform.openai.com/api-keys', (error) => {
        if (error) {
          console.log('❌ Не удалось открыть браузер');
          console.log('Перейдите вручную: https://platform.openai.com/api-keys');
        }
      });
      showInstructions();
      break;
      
    case '2':
      showInstructions();
      break;
      
    case '3':
      await checkKey();
      break;
      
    default:
      console.log('❌ Неверный выбор');
  }
  
  rl.close();
}

function showInstructions() {
  console.log('\n📋 Инструкции:');
  console.log('1. Зарегистрируйтесь на https://platform.openai.com');
  console.log('2. Войдите в аккаунт');
  console.log('3. Перейдите в API Keys');
  console.log('4. Нажмите "Create new secret key"');
  console.log('5. Скопируйте ключ (начинается с sk-)');
  console.log('6. Добавьте в .env файл:');
  console.log('   OPENAI_API_KEY=sk-your-key-here\n');
  console.log('💡 Ключ выглядит так: sk-proj-abc123...');
}

async function checkKey() {
  const key = await askQuestion('\nВведите ваш API ключ для проверки: ');
  
  if (!key.startsWith('sk-')) {
    console.log('❌ Неверный формат ключа. Должен начинаться с "sk-"');
    return;
  }
  
  console.log('🔍 Проверяю ключ...');
  
  const options = {
    hostname: 'api.openai.com',
    path: '/v1/models',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${key}`,
      'User-Agent': 'ChatApp/1.0'
    }
  };
  
  const req = https.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log('✅ Ключ действителен!');
      console.log(`\nДобавьте в .env файл:\nOPENAI_API_KEY=${key}`);
    } else {
      console.log('❌ Ключ недействителен или истек');
    }
  });
  
  req.on('error', () => {
    console.log('❌ Ошибка проверки ключа');
  });
  
  req.end();
}

main().catch(console.error);