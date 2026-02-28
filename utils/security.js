// Система безопасности
class SecurityManager {
  constructor() {
    this.rateLimits = new Map();
    this.blockedIPs = new Set();
    this.suspiciousActivity = [];
  }

  checkRateLimit(identifier, limit = 10, window = 60000) {
    const now = Date.now();
    const key = `${identifier}_${Math.floor(now / window)}`;
    
    const current = this.rateLimits.get(key) || 0;
    if (current >= limit) {
      this.logSuspiciousActivity(identifier, 'rate_limit_exceeded');
      return false;
    }
    
    this.rateLimits.set(key, current + 1);
    return true;
  }

  validateMessage(message) {
    if (!message || typeof message !== 'string') return false;
    if (message.length > 1000) return false;
    
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i
    ];
    
    return !suspiciousPatterns.some(pattern => pattern.test(message));
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  blockIP(ip, reason = 'suspicious_activity') {
    this.blockedIPs.add(ip);
    this.logSuspiciousActivity(ip, reason);
  }

  isBlocked(ip) {
    return this.blockedIPs.has(ip);
  }

  logSuspiciousActivity(identifier, type, details = null) {
    this.suspiciousActivity.push({
      identifier,
      type,
      details,
      timestamp: new Date().toISOString()
    });
    
    if (this.suspiciousActivity.length > 100) {
      this.suspiciousActivity.shift();
    }
  }

  getSuspiciousActivity() {
    return this.suspiciousActivity.slice(-20);
  }

  cleanup() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    this.rateLimits.forEach((value, key) => {
      const timestamp = parseInt(key.split('_').pop()) * 60000;
      if (now - timestamp > oneHour) {
        this.rateLimits.delete(key);
      }
    });
  }
}

module.exports = SecurityManager;