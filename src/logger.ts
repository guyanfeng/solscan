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

  private formatMessage(msg:any): string {
    if (!msg){
      return '';
    }
    if (typeof msg === 'string') {
      return msg;
    }
    if (msg instanceof Error) {
      return msg.stack || msg.message;
    }
    if (typeof msg === 'object') {
        return JSON.stringify(msg, null, 2);
    }
    return String(msg);
  }

  private log(logName:string, level: LogLevel, ...message: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedArgs = message.map(arg => this.formatMessage(arg));
    console.log(timestamp,logName,level, ...formattedArgs);
  }

  public info(...message: any[]): void {
    this.log(this.name, this.levels.INFO, ...message);
  }

  public debug(...message: any[]): void {
    this.log(this.name, this.levels.DEBUG, ...message);
  }

  public error(...message: any[]): void {
    this.log(this.name, this.levels.ERROR, ...message);
  }
}

export default Logger;
