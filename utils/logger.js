// Простая система логирования
const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.createLogDir();
  }

  createLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFileName(type = 'app') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${type}_${date}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      logMessage += ` | Data: ${JSON.stringify(data)}`;
    }
    
    return logMessage + '\n';
  }

  writeLog(level, message, data = null, type = 'app') {
    try {
      const logMessage = this.formatMessage(level, message, data);
      const filename = this.getLogFileName(type);
      
      fs.appendFileSync(filename, logMessage);
      
      // Также выводим в консоль
      console.log(logMessage.trim());
    } catch (error) {
      console.error('Error writing log:', error);
    }
  }

  info(message, data = null, type = 'app') {
    this.writeLog('info', message, data, type);
  }

  warn(message, data = null, type = 'app') {
    this.writeLog('warn', message, data, type);
  }

  error(message, data = null, type = 'app') {
    this.writeLog('error', message, data, type);
  }

  debug(message, data = null, type = 'app') {
    if (process.env.NODE_ENV === 'development') {
      this.writeLog('debug', message, data, type);
    }
  }

  // Специальные логи для чата
  chatMessage(username, message, type = 'message') {
    this.writeLog('info', `Chat ${type}: ${username} - ${message}`, null, 'chat');
  }

  userAction(username, action, details = null) {
    this.writeLog('info', `User action: ${username} - ${action}`, details, 'users');
  }

  gameAction(gameType, action, players = null) {
    this.writeLog('info', `Game ${gameType}: ${action}`, { players }, 'games');
  }

  systemEvent(event, details = null) {
    this.writeLog('info', `System event: ${event}`, details, 'system');
  }

  // Очистка старых логов
  cleanOldLogs(daysToKeep = 7) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }

  // Получить логи за определенный период
  getLogs(type = 'app', days = 1) {
    try {
      const logs = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const filename = path.join(this.logDir, `${type}_${dateStr}.log`);
        
        if (fs.existsSync(filename)) {
          const content = fs.readFileSync(filename, 'utf8');
          logs.push({
            date: dateStr,
            content: content.split('\n').filter(line => line.trim())
          });
        }
      }
      
      return logs;
    } catch (error) {
      console.error('Error getting logs:', error);
      return [];
    }
  }
}

module.exports = new Logger();