// Утилиты для работы с IP адресами
class IPUtils {
  static getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
  }

  static isLocalIP(ip) {
    const localPatterns = [
      /^127\./,
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^::1$/,
      /^localhost$/i
    ];
    return localPatterns.some(pattern => pattern.test(ip));
  }

  static isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  static anonymizeIP(ip) {
    if (!ip) return 'unknown';
    
    // IPv4
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.xxx.xxx`;
      }
    }
    
    // IPv6 - показываем только первые 4 группы
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length >= 4) {
        return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:xxxx:xxxx:xxxx:xxxx`;
      }
    }
    
    return 'unknown';
  }

  static getIPInfo(ip) {
    return {
      ip: ip,
      anonymized: this.anonymizeIP(ip),
      isLocal: this.isLocalIP(ip),
      isValid: this.isValidIP(ip),
      type: ip.includes(':') ? 'IPv6' : 'IPv4'
    };
  }
}

module.exports = IPUtils;