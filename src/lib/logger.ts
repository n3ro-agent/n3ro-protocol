export type LogContext = Record<string, unknown>;

export class Logger {
  constructor(private readonly scope: string) {}

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`);
  }

  info(message: string, context: LogContext = {}): void {
    this.write("INFO", message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.write("WARN", message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.write("ERROR", message, context);
  }

  private write(level: string, message: string, context: LogContext): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...context
    };

    const line = JSON.stringify(payload);
    if (level === "ERROR") {
      console.error(line);
      return;
    }

    console.log(line);
  }
}
