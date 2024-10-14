// logger.ts

type LogLevel = 'INFO' | 'DEBUG' | 'ERROR';

class Logger {
  private levels: Record<LogLevel, LogLevel> = {
    INFO: 'INFO',
    DEBUG: 'DEBUG',
    ERROR: 'ERROR',
  };
  private name: string = 'Index';
  constructor(name?: string) {
    if (name) {
      this.name = name;
    }
  }

  private log(logName:string, level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${logName}] [${level}] ${message}`);
  }

  public info(message: string): void {
    this.log(this.name, this.levels.INFO, message);
  }

  public debug(message: string): void {
    this.log(this.name, this.levels.DEBUG, message);
  }

  public error(message: string): void {
    this.log(this.name, this.levels.ERROR, message);
  }
}

export default Logger;
