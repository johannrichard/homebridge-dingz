import {
  InvalidTypeError,
  MethodNotImplementedError,
  DeviceNotImplementedError,
  DeviceNotReachableError,
} from '../errors';

describe('Custom Error Classes', () => {
  describe('InvalidTypeError', () => {
    it('should create an error with the correct name', () => {
      const error = new InvalidTypeError('test message');
      expect(error.name).toBe('InvalidTypeError');
      expect(error.message).toBe('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(InvalidTypeError);
    });

    it('should create an error without a message', () => {
      const error = new InvalidTypeError();
      expect(error.name).toBe('InvalidTypeError');
      expect(error.message).toBe('');
    });

    it('should maintain prototype chain', () => {
      const error = new InvalidTypeError('test');
      expect(Object.getPrototypeOf(error)).toBe(InvalidTypeError.prototype);
    });
  });

  describe('MethodNotImplementedError', () => {
    it('should create an error with the correct name', () => {
      const error = new MethodNotImplementedError('test message');
      expect(error.name).toBe('MethodNotImplementedError');
      expect(error.message).toBe('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MethodNotImplementedError);
    });

    it('should create an error without a message', () => {
      const error = new MethodNotImplementedError();
      expect(error.name).toBe('MethodNotImplementedError');
      expect(error.message).toBe('');
    });
  });

  describe('DeviceNotImplementedError', () => {
    it('should create an error with the correct name', () => {
      const error = new DeviceNotImplementedError('test message');
      expect(error.name).toBe('DeviceNotImplementedError');
      expect(error.message).toBe('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DeviceNotImplementedError);
    });

    it('should create an error without a message', () => {
      const error = new DeviceNotImplementedError();
      expect(error.name).toBe('DeviceNotImplementedError');
      expect(error.message).toBe('');
    });
  });

  describe('DeviceNotReachableError', () => {
    it('should create an error with the correct name', () => {
      const error = new DeviceNotReachableError('test message');
      expect(error.name).toBe('DeviceNotReachableError');
      expect(error.message).toBe('test message');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DeviceNotReachableError);
    });

    it('should create an error without a message', () => {
      const error = new DeviceNotReachableError();
      expect(error.name).toBe('DeviceNotReachableError');
      expect(error.message).toBe('');
    });

    it('should be catchable as Error', () => {
      try {
        throw new DeviceNotReachableError('Device offline');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DeviceNotReachableError);
        if (error instanceof DeviceNotReachableError) {
          expect(error.message).toBe('Device offline');
        }
      }
    });
  });
});
