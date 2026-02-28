#!/usr/bin/env node

const https = require('https');

// Ваш API ключ
const API_KEY = 'sk-...NHUA'; // Замените на полный ключ

console.log('🤖 Тестирование OpenAI API...\n');

const data = JSON.stringify({
  model: 'gpt-3.5-turbo',
  messages: [{
    role: 'user',
    content: 'Привет! Ты работаешь?'
  }],
  max_tokens: 50
});

const options = {
  hostname: 'api.openai.com',
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      const response = JSON.parse(responseData);
      console.log('✅ API работает!');
      console.log('🤖 Ответ:', response.choices[0].message.content);
    } else {
      console.log('❌ Ошибка:', res.statusCode);
      console.log('📄 Ответ:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.log('❌ Ошибка запроса:', error.message);
});

req.write(data);
req.end();