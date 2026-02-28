// Анализатор производительности
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.alerts = [];
  }

  startTimer(name) {
    this.metrics.set(name, { start: Date.now() });
  }

  endTimer(name) {
    const metric = this.metrics.get(name);
    if (metric) {
      metric.duration = Date.now() - metric.start;
      metric.end = Date.now();
      
      if (metric.duration > 1000) {
        this.alerts.push({
          type: 'slow_operation',
          name,
          duration: metric.duration,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  recordMetric(name, value, unit = 'ms') {
    this.metrics.set(name, {
      value,
      unit,
      timestamp: Date.now()
    });
  }

  getMetrics() {
    const result = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  getAlerts() {
    return this.alerts.slice(-20);
  }

  clearAlerts() {
    this.alerts = [];
  }

  getSystemInfo() {
    const usage = process.memoryUsage();
    return {
      memory: {
        rss: Math.round(usage.rss / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
      },
      uptime: Math.round(process.uptime()),
      cpu: process.cpuUsage(),
      version: process.version
    };
  }
}

module.exports = PerformanceMonitor;