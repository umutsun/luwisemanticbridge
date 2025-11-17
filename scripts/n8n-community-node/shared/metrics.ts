export class PerformanceMetrics {
  private timers: { [key: string]: number } = {};

  startTimer(name: string) {
    this.timers[name] = Date.now();
  }

  endTimer(name: string): number {
    if (this.timers[name]) {
      const duration = Date.now() - this.timers[name];
      delete this.timers[name];
      return duration;
    }
    return 0;
  }
}