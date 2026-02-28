#!/usr/bin/env node

// Тестирование бесплатных API
require('dotenv').config();

async function testGroqAPI() {
  console.log('🤖 Тестирование Groq API...');
  
  if (!process.env.GROQ_API_KEY) {
    console.log('❌ GROQ_API_KEY не найден в .env');
    return false;
  }

  try {
    const fetch = require('node-fetch');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: 'Привет! Как дела?' }],
        max_tokens: 50,
        temperature: 0.7
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Groq API работает!');
      console.log('🤖 Ответ:', data.choices[0]?.message?.content);
      return true;
    } else {
      console.log('❌ Groq API ошибка:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Groq API ошибка:', error.message);
    return false;
  }
}

async function testGeminiAPI() {
  console.log('\n🧠 Тестирование Gemini API...');
  
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ GEMINI_API_KEY не найден в .env');
    return false;
  }

  try {
    const fetch = require('node-fetch');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Привет! Как дела?' }]
        }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.7
        }
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Gemini API работает!');
      console.log('🧠 Ответ:', data.candidates[0]?.content?.parts[0]?.text);
      return true;
    } else {
      console.log('❌ Gemini API ошибка:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Gemini API ошибка:', error.message);
    return false;
  }
}

async function testTranslationAPI() {
  console.log('\n🌍 Тестирование MyMemory Translation API...');
  
  try {
    const fetch = require('node-fetch');
    const text = 'Привет, как дела?';
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ru|en`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.responseStatus === 200) {
        console.log('✅ Translation API работает!');
        console.log('🌍 Перевод:', `"${text}" → "${data.responseData.translatedText}"`);
        return true;
      } else {
        console.log('❌ Translation API ошибка:', data.responseStatus);
        return false;
      }
    } else {
      console.log('❌ Translation API ошибка:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Translation API ошибка:', error.message);
    return false;
  }
}

async function testWeatherAPI() {
  console.log('\n☁️ Тестирование OpenWeatherMap API...');
  
  if (!process.env.OPENWEATHER_API_KEY) {
    console.log('❌ OPENWEATHER_API_KEY не найден в .env');
    return false;
  }

  try {
    const fetch = require('node-fetch');
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Moscow&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=ru`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Weather API работает!');
      console.log('☁️ Погода в Москве:', `${data.main.temp}°C, ${data.weather[0].description}`);
      return true;
    } else {
      console.log('❌ Weather API ошибка:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Weather API ошибка:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 Тестирование бесплатных API для чата\n');
  
  const results = {
    groq: await testGroqAPI(),
    gemini: await testGeminiAPI(),
    translation: await testTranslationAPI(),
    weather: await testWeatherAPI()
  };
  
  console.log('\n📊 Результаты тестирования:');
  console.log('🤖 Groq AI:', results.groq ? '✅ Работает' : '❌ Не работает');
  console.log('🧠 Gemini AI:', results.gemini ? '✅ Работает' : '❌ Не работает');
  console.log('🌍 Переводчик:', results.translation ? '✅ Работает' : '❌ Не работает');
  console.log('☁️ Погода:', results.weather ? '✅ Работает' : '❌ Не работает');
  
  const workingAPIs = Object.values(results).filter(Boolean).length;
  console.log(`\n🎯 Работает ${workingAPIs} из 4 API`);
  
  if (workingAPIs === 0) {
    console.log('\n⚠️ Ни один API не настроен. Чат будет работать с базовой функциональностью.');
    console.log('📖 Смотрите инструкцию: FREE_API_SETUP.md');
  } else if (workingAPIs < 4) {
    console.log('\n💡 Для полной функциональности настройте остальные API.');
    console.log('📖 Смотрите инструкцию: FREE_API_SETUP.md');
  } else {
    console.log('\n🎉 Все API настроены! Чат готов к работе с полной функциональностью.');
  }
}

main().catch(console.error);