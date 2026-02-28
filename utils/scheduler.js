// Планировщик задач
class TaskScheduler {
  constructor() {
    this.tasks = new Map();
    this.intervals = new Map();
  }

  schedule(name, fn, interval, immediate = false) {
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name));
    }

    this.tasks.set(name, { fn, interval, lastRun: null });
    
    if (immediate) {
      this.runTask(name);
    }

    const intervalId = setInterval(() => {
      this.runTask(name);
    }, interval);

    this.intervals.set(name, intervalId);
  }

  runTask(name) {
    const task = this.tasks.get(name);
    if (task) {
      try {
        task.fn();
        task.lastRun = new Date();
      } catch (error) {
        console.error(`Task ${name} failed:`, error);
      }
    }
  }

  cancel(name) {
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name));
      this.intervals.delete(name);
    }
    this.tasks.delete(name);
  }

  getTasks() {
    return Array.from(this.tasks.entries()).map(([name, task]) => ({
      name,
      interval: task.interval,
      lastRun: task.lastRun,
      nextRun: task.lastRun ? new Date(task.lastRun.getTime() + task.interval) : null
    }));
  }

  stop() {
    this.intervals.forEach(intervalId => clearInterval(intervalId));
    this.intervals.clear();
    this.tasks.clear();
  }
}

module.exports = TaskScheduler;