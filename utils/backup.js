// Система бэкапов чата
const FileUtils = require('./fileUtils');

class BackupManager {
  constructor(pool) {
    this.pool = pool;
    this.autoBackupInterval = 24 * 60 * 60 * 1000; // 24 часа
    this.maxBackups = 7; // Хранить 7 последних бэкапов
  }

  async createBackup() {
    try {
      const client = await this.pool.connect();
      
      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.3.0',
        data: {}
      };

      // Бэкап пользователей
      const users = await client.query('SELECT * FROM users ORDER BY created_at');
      backup.data.users = users.rows;

      // Бэкап сообщений (последние 1000)
      const messages = await client.query(`
        SELECT m.*, u.username 
        FROM messages m 
        JOIN users u ON m.user_id = u.id 
        ORDER BY m.created_at DESC 
        LIMIT 1000
      `);
      backup.data.messages = messages.rows;

      // Бэкап игр
      const games = await client.query('SELECT * FROM games ORDER BY created_at DESC LIMIT 100');
      backup.data.games = games.rows;

      // Бэкап опросов
      const polls = await client.query('SELECT * FROM polls ORDER BY created_at DESC LIMIT 50');
      backup.data.polls = polls.rows;

      client.release();

      const filename = `backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`;
      const filePath = FileUtils.saveToFile(backup, filename);
      
      if (filePath) {
        console.log(`✅ Backup created: ${filename}`);
        await this.cleanOldBackups();
        return { success: true, filename, path: filePath };
      }
      
      return { success: false, error: 'Failed to save backup' };
    } catch (error) {
      console.error('Error creating backup:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanOldBackups() {
    try {
      const fs = require('fs');
      const path = require('path');
      const backupDir = FileUtils.createBackupFolder();
      
      const files = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          stats: fs.statSync(path.join(backupDir, file))
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime);

      if (files.length > this.maxBackups) {
        const filesToDelete = files.slice(this.maxBackups);
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Deleted old backup: ${file.name}`);
        });
      }
    } catch (error) {
      console.error('Error cleaning old backups:', error);
    }
  }

  async restoreFromBackup(filename) {
    try {
      const backup = FileUtils.loadFromFile(filename);
      if (!backup) {
        return { success: false, error: 'Backup file not found' };
      }

      const client = await this.pool.connect();
      
      // Очищаем существующие данные (осторожно!)
      await client.query('TRUNCATE TABLE messages, games, polls, game_participants, poll_votes CASCADE');
      
      // Восстанавливаем пользователей
      for (const user of backup.data.users) {
        await client.query(`
          INSERT INTO users (id, username, created_at, last_seen, is_temporary, avatar_url, bio, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            username = $2, last_seen = $4, avatar_url = $6, bio = $7, status = $8
        `, [user.id, user.username, user.created_at, user.last_seen, 
            user.is_temporary, user.avatar_url, user.bio, user.status]);
      }

      // Восстанавливаем сообщения
      for (const message of backup.data.messages) {
        await client.query(`
          INSERT INTO messages (id, user_id, message_type, content, target_user_id, 
                               file_name, file_type, file_size, file_data, voice_duration, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [message.id, message.user_id, message.message_type, message.content,
            message.target_user_id, message.file_name, message.file_type,
            message.file_size, message.file_data, message.voice_duration, message.created_at]);
      }

      client.release();
      
      console.log(`✅ Backup restored from: ${filename}`);
      return { success: true, message: 'Backup restored successfully' };
    } catch (error) {
      console.error('Error restoring backup:', error);
      return { success: false, error: error.message };
    }
  }

  startAutoBackup() {
    setInterval(async () => {
      console.log('🔄 Starting automatic backup...');
      await this.createBackup();
    }, this.autoBackupInterval);
    
    console.log('⏰ Auto backup scheduled every 24 hours');
  }

  async getBackupList() {
    try {
      const fs = require('fs');
      const path = require('path');
      const backupDir = FileUtils.createBackupFolder();
      
      const files = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('backup_') && file.endsWith('.json'))
        .map(file => {
          const stats = fs.statSync(path.join(backupDir, file));
          return {
            name: file,
            size: FileUtils.formatFileSize(stats.size),
            created: stats.mtime.toISOString(),
            path: path.join(backupDir, file)
          };
        })
        .sort((a, b) => new Date(b.created) - new Date(a.created));

      return files;
    } catch (error) {
      console.error('Error getting backup list:', error);
      return [];
    }
  }
}

module.exports = BackupManager;