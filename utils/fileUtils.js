// Утилиты для работы с файлами
const fs = require('fs');
const path = require('path');

class FileUtils {
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }

  static isImageFile(filename) {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    return imageExts.includes(this.getFileExtension(filename));
  }

  static isVideoFile(filename) {
    const videoExts = ['.mp4', '.webm', '.ogg', '.avi', '.mov'];
    return videoExts.includes(this.getFileExtension(filename));
  }

  static isAudioFile(filename) {
    const audioExts = ['.mp3', '.wav', '.ogg', '.webm', '.aac'];
    return audioExts.includes(this.getFileExtension(filename));
  }

  static generateThumbnail(base64Data, maxWidth = 200, maxHeight = 200) {
    // Простая функция для создания миниатюр (требует canvas)
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
          const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        
        img.src = `data:image/jpeg;base64,${base64Data}`;
      } catch (error) {
        resolve(null);
      }
    });
  }

  static validateFile(filename, size, type) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/ogg',
      'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
      'application/pdf', 'text/plain'
    ];

    if (size > maxSize) {
      return { valid: false, error: 'Файл слишком большой (максимум 10MB)' };
    }

    if (!allowedTypes.some(allowed => type.includes(allowed.split('/')[0]))) {
      return { valid: false, error: 'Неподдерживаемый тип файла' };
    }

    return { valid: true };
  }

  static createBackupFolder() {
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
  }

  static saveToFile(data, filename) {
    try {
      const backupDir = this.createBackupFolder();
      const filePath = path.join(backupDir, filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return filePath;
    } catch (error) {
      console.error('Error saving file:', error);
      return null;
    }
  }

  static loadFromFile(filename) {
    try {
      const backupDir = this.createBackupFolder();
      const filePath = path.join(backupDir, filename);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('Error loading file:', error);
      return null;
    }
  }
}

module.exports = FileUtils;