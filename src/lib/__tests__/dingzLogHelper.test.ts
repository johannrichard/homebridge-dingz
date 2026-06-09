import { Logger, LogLevel } from 'homebridge';
import { DingzLogger } from '../dingzLogHelper';

// Mock chalk to avoid ANSI color codes in tests
jest.mock('chalk', () => ({
  magentaBright: (text: string) => text,
}));

describe('DingzLogger', () => {
  let mockLogger: jest.Mocked<Logger>;
  let dingzLogger: DingzLogger;

  beforeEach(() => {
    // Create a mock logger
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      success: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    dingzLogger = new DingzLogger('TestDingz', mockLogger);
  });

  describe('log', () => {
    it('should prefix message with dingz name', () => {
      dingzLogger.log(LogLevel.INFO, 'test message', 'param1');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        '[TestDingz] test message',
        'param1'
      );
    });

    it('should handle multiple parameters', () => {
      dingzLogger.log(LogLevel.DEBUG, 'test', 'p1', 'p2', 'p3');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        '[TestDingz] test',
        'p1',
        'p2',
        'p3'
      );
    });

    it('should handle no additional parameters', () => {
      dingzLogger.log(LogLevel.WARN, 'warning message');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.WARN,
        '[TestDingz] warning message'
      );
    });
  });

  describe('info', () => {
    it('should call log with INFO level', () => {
      dingzLogger.info('info message', 'extra');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        '[TestDingz] info message',
        'extra'
      );
    });
  });

  describe('warn', () => {
    it('should call log with WARN level', () => {
      dingzLogger.warn('warning message', 'extra');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.WARN,
        '[TestDingz] warning message',
        'extra'
      );
    });
  });

  describe('error', () => {
    it('should call log with ERROR level', () => {
      dingzLogger.error('error message', 'extra');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.ERROR,
        '[TestDingz] error message',
        'extra'
      );
    });
  });

  describe('debug', () => {
    it('should call log with DEBUG level', () => {
      dingzLogger.debug('debug message', 'extra');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.DEBUG,
        '[TestDingz] debug message',
        'extra'
      );
    });
  });

  describe('prefix customization', () => {
    it('should use custom prefix', () => {
      const customLogger = new DingzLogger('CustomDevice', mockLogger);
      customLogger.info('test');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        '[CustomDevice] test'
      );
    });

    it('should handle empty prefix', () => {
      const emptyLogger = new DingzLogger('', mockLogger);
      emptyLogger.info('test');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        LogLevel.INFO,
        '[] test'
      );
    });
  });
});
