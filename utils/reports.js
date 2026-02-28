// Генератор отчетов
class ReportGenerator {
  constructor(analytics, chatStats, performance, security) {
    this.analytics = analytics;
    this.chatStats = chatStats;
    this.performance = performance;
    this.security = security;
  }

  async generateDailyReport() {
    const stats = await this.chatStats.getDailyStats();
    const topEvents = this.analytics.getTopEvents(5);
    const activeUsers = this.analytics.getActiveUsers(1440); // 24 hours
    const systemInfo = this.performance.getSystemInfo();
    const alerts = this.performance.getAlerts();
    const security = this.security.getSuspiciousActivity();

    return {
      date: new Date().toISOString().split('T')[0],
      summary: {
        messages: stats.messages,
        users: stats.users,
        files: stats.files,
        games: stats.games,
        polls: stats.polls
      },
      activity: {
        topEvents,
        activeUsers,
        topUsers: stats.topUsers
      },
      system: {
        memory: systemInfo.memory,
        uptime: systemInfo.uptime,
        alerts: alerts.length
      },
      security: {
        suspiciousActivity: security.length,
        blockedIPs: this.security.blockedIPs.size
      }
    };
  }

  async generateWeeklyReport() {
    const stats = await this.chatStats.getWeeklyStats();
    const systemStats = await this.chatStats.getSystemStats();
    
    return {
      period: 'weekly',
      summary: {
        totalMessages: stats.totalMessages,
        totalUsers: stats.totalUsers,
        totalGames: stats.totalGames,
        dailyBreakdown: stats.dailyBreakdown
      },
      trends: {
        topUsers: stats.topUsers.slice(0, 10),
        popularGames: stats.popularGameTypes
      },
      system: {
        database: systemStats.database,
        performance: this.performance.getSystemInfo()
      }
    };
  }

  generateHealthReport() {
    const system = this.performance.getSystemInfo();
    const alerts = this.performance.getAlerts();
    
    const health = {
      status: 'healthy',
      issues: [],
      recommendations: []
    };

    // Проверка памяти
    if (system.memory.heapUsed > 500) {
      health.status = 'warning';
      health.issues.push('High memory usage');
      health.recommendations.push('Consider restarting server or optimizing memory usage');
    }

    // Проверка алертов
    if (alerts.length > 10) {
      health.status = 'warning';
      health.issues.push('Multiple performance alerts');
      health.recommendations.push('Review slow operations and optimize code');
    }

    // Проверка безопасности
    const suspiciousCount = this.security.getSuspiciousActivity().length;
    if (suspiciousCount > 5) {
      health.status = 'warning';
      health.issues.push('Suspicious activity detected');
      health.recommendations.push('Review security logs and consider additional protection');
    }

    return {
      ...health,
      timestamp: new Date().toISOString(),
      system,
      alerts: alerts.slice(-5),
      security: {
        suspiciousActivity: suspiciousCount,
        blockedIPs: this.security.blockedIPs.size
      }
    };
  }
}

module.exports = ReportGenerator;