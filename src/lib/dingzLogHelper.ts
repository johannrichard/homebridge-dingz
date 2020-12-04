import { Logger, LogLevel } from 'homebridge';
import chalk from 'chalk';

/**
 * Drop-in helper class used to prefix debug messages with a colored dingz name
 */
export class DingzLogger extends Logger {
  public dingzPrefix = '[Device]';
  /**
   *
   * @param logger the homebridge logger to do the actual logging
   */
  constructor(private readonly logger: Logger) {
    super();
  }

  /**
   * Logger.log like method
   * @param logLevel Log level (Logger.LogLevel)
   * @param message The message
   * @param parameters Additional parameter
   */
  public log(
    logLevel: LogLevel,
    message: string,
    ...parameters: unknown[]
  ): void {
    message = chalk.magentaBright(`[${this.dingzPrefix}] `) + message;

    // FIXME: #142 Upstream "bug" (or feature) in Homerbidge's Logger class
    // Only when Logger.debug() is called does the class check whether
    // DEBUG is enabled or not.
    // TODO: Wait for [homebridge/homebridge#2732](https://github.com/homebridge/homebridge/pull/2732)
    if (logLevel === LogLevel.DEBUG) {
      super.debug(message, ...parameters);
    } else {
      super.log(logLevel, message, ...parameters);
    }
  }

  public info(message: string, ...parameters: unknown[]): void {
    super.info(LogLevel.INFO, `${message}`, ...parameters);
  }

  public warn(message: string, ...parameters: unknown[]): void {
    super.log(LogLevel.WARN, `${message}`, ...parameters);
  }

  public error(message: string, ...parameters: unknown[]): void {
    super.log(LogLevel.ERROR, `${message}`, ...parameters);
  }

  public debug(message: string, ...parameters: unknown[]): void {
    super.log(LogLevel.DEBUG, `${message}`, ...parameters);
  }
}
