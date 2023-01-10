/*
 * timer class that executes callback in
 * timeout seconds
 */
class Timer {
  public readonly timeout: number;

  private readonly callback: () => void;
  private timer: NodeJS.Timeout;

  constructor(callback: () => void, timeout: number) {
    this.timeout = timeout;
    this.callback = callback;
    this.start();
  }

  public clear() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  public reset() {
    this.clear();
    this.start();
  }

  private start() {
    this.timer = setTimeout(this.callback, this.timeout);
  }
}

export default Timer;
