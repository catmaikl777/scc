// Система аналитики
class Analytics {
  constructor() {
    this.events = [];
    this.userSessions = new Map();
    this.maxEvents = 1000;
  }

  track(event, userId = null, data = {}) {
    const eventData = {
      id: Date.now() + Math.random(),
      event,
      userId,
      data,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId(userId)
    };

    this.events.unshift(eventData);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }
  }

  getSessionId(userId) {
    if (!userId) return null;
    
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, {
        sessionId: `session_${Date.now()}_${userId}`,
        startTime: Date.now(),
        lastActivity: Date.now()
      });
    }
    
    const session = this.userSessions.get(userId);
    session.lastActivity = Date.now();
    return session.sessionId;
  }

  getEvents(filter = {}) {
    let filtered = this.events;
    
    if (filter.event) {
      filtered = filtered.filter(e => e.event === filter.event);
    }
    
    if (filter.userId) {
      filtered = filtered.filter(e => e.userId === filter.userId);
    }
    
    if (filter.limit) {
      filtered = filtered.slice(0, filter.limit);
    }
    
    return filtered;
  }

  getTopEvents(limit = 10) {
    const eventCounts = {};
    this.events.forEach(e => {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
    });
    
    return Object.entries(eventCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([event, count]) => ({ event, count }));
  }

  getActiveUsers(minutes = 30) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const activeUsers = new Set();
    
    this.events.forEach(e => {
      if (e.userId && new Date(e.timestamp).getTime() > cutoff) {
        activeUsers.add(e.userId);
      }
    });
    
    return activeUsers.size;
  }

  getUserActivity(userId) {
    const userEvents = this.events.filter(e => e.userId === userId);
    const session = this.userSessions.get(userId);
    
    return {
      totalEvents: userEvents.length,
      session: session || null,
      recentEvents: userEvents.slice(0, 10),
      eventTypes: this.getEventTypes(userEvents)
    };
  }

  getEventTypes(events) {
    const types = {};
    events.forEach(e => {
      types[e.event] = (types[e.event] || 0) + 1;
    });
    return types;
  }

  cleanup() {
    const oneHour = 60 * 60 * 1000;
    const cutoff = Date.now() - oneHour;
    
    this.userSessions.forEach((session, userId) => {
      if (session.lastActivity < cutoff) {
        this.userSessions.delete(userId);
      }
    });
  }
}

module.exports = Analytics;