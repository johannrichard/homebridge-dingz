import { Logger, LogLevel } from 'homebridge';
import chalk from 'chalk';

/**
 * Drop-in helper class used to prefix debug messages with a colored dingz name
 */
export class DingzLogger {
  /**
   *
   * @param dingzPrefix the prefix to use in the messages
   * @param logger the homebridge logger to do the actual logging
   */
  constructor(
    private readonly dingzPrefix: string,
    private readonly logger: Logger,
  ) {}

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
    this.logger.log(logLevel, message, ...parameters);
  }

  public info(message: string, ...parameters: unknown[]): void {
    this.log(LogLevel.INFO, `${message}`, ...parameters);
  }

  public warn(message: string, ...parameters: unknown[]): void {
    this.log(LogLevel.WARN, `${message}`, ...parameters);
  }

  public error(message: string, ...parameters: unknown[]): void {
    this.log(LogLevel.ERROR, `${message}`, ...parameters);
  }

  public debug(message: string, ...parameters: unknown[]): void {
    this.log(LogLevel.DEBUG, `${message}`, ...parameters);
  }
}
