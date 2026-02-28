// Генератор статистики чата
class ChatStats {
  constructor(pool) {
    this.pool = pool;
  }

  async getDailyStats() {
    const client = await this.pool.connect();
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const stats = {
        date: today,
        messages: 0,
        users: 0,
        files: 0,
        games: 0,
        polls: 0,
        topUsers: [],
        messageTypes: {}
      };

      // Сообщения за сегодня
      const messagesResult = await client.query(`
        SELECT COUNT(*) as count, message_type 
        FROM messages 
        WHERE DATE(created_at) = $1 
        GROUP BY message_type
      `, [today]);

      messagesResult.rows.forEach(row => {
        stats.messageTypes[row.message_type] = parseInt(row.count);
        stats.messages += parseInt(row.count);
      });

      // Активные пользователи за сегодня
      const usersResult = await client.query(`
        SELECT COUNT(DISTINCT user_id) as count 
        FROM messages 
        WHERE DATE(created_at) = $1
      `, [today]);
      stats.users = parseInt(usersResult.rows[0]?.count || 0);

      // Файлы за сегодня
      const filesResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM messages 
        WHERE DATE(created_at) = $1 AND message_type = 'file'
      `, [today]);
      stats.files = parseInt(filesResult.rows[0]?.count || 0);

      // Игры за сегодня
      const gamesResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM games 
        WHERE DATE(created_at) = $1
      `, [today]);
      stats.games = parseInt(gamesResult.rows[0]?.count || 0);

      // Опросы за сегодня
      const pollsResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM polls 
        WHERE DATE(created_at) = $1
      `, [today]);
      stats.polls = parseInt(pollsResult.rows[0]?.count || 0);

      // Топ пользователей по сообщениям
      const topUsersResult = await client.query(`
        SELECT u.username, COUNT(m.id) as message_count
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE DATE(m.created_at) = $1
        GROUP BY u.id, u.username
        ORDER BY message_count DESC
        LIMIT 5
      `, [today]);
      stats.topUsers = topUsersResult.rows;

      return stats;
    } finally {
      client.release();
    }
  }

  async getWeeklyStats() {
    const client = await this.pool.connect();
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const stats = {
        period: '7 days',
        totalMessages: 0,
        totalUsers: 0,
        totalGames: 0,
        dailyBreakdown: [],
        topUsers: [],
        popularGameTypes: []
      };

      // Сообщения по дням
      const dailyResult = await client.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM messages
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
        ORDER BY date
      `, [weekAgo.toISOString()]);

      stats.dailyBreakdown = dailyResult.rows.map(row => ({
        date: row.date,
        messages: parseInt(row.count)
      }));

      // Общая статистика за неделю
      const totalResult = await client.query(`
        SELECT 
          COUNT(*) as messages,
          COUNT(DISTINCT user_id) as users
        FROM messages
        WHERE created_at >= $1
      `, [weekAgo.toISOString()]);

      stats.totalMessages = parseInt(totalResult.rows[0]?.messages || 0);
      stats.totalUsers = parseInt(totalResult.rows[0]?.users || 0);

      // Игры за неделю
      const gamesResult = await client.query(`
        SELECT type, COUNT(*) as count
        FROM games
        WHERE created_at >= $1
        GROUP BY type
        ORDER BY count DESC
      `, [weekAgo.toISOString()]);

      stats.popularGameTypes = gamesResult.rows;
      stats.totalGames = gamesResult.rows.reduce((sum, game) => sum + parseInt(game.count), 0);

      // Топ пользователей за неделю
      const topUsersResult = await client.query(`
        SELECT u.username, COUNT(m.id) as message_count
        FROM messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.created_at >= $1
        GROUP BY u.id, u.username
        ORDER BY message_count DESC
        LIMIT 10
      `, [weekAgo.toISOString()]);

      stats.topUsers = topUsersResult.rows;

      return stats;
    } finally {
      client.release();
    }
  }

  async getSystemStats() {
    const client = await this.pool.connect();
    try {
      const stats = {
        database: {},
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.version
        }
      };

      // Статистика базы данных
      const dbStats = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM messages) as total_messages,
          (SELECT COUNT(*) FROM games) as total_games,
          (SELECT COUNT(*) FROM polls) as total_polls,
          (SELECT COUNT(*) FROM user_sessions WHERE disconnected_at IS NULL) as active_sessions
      `);

      stats.database = dbStats.rows[0];

      // Размер базы данных
      const sizeResult = await client.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `);
      stats.database.size = sizeResult.rows[0]?.size || 'Unknown';

      return stats;
    } finally {
      client.release();
    }
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}д ${hours}ч ${minutes}м`;
  }

  formatMemory(bytes) {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }
}

module.exports = ChatStats;