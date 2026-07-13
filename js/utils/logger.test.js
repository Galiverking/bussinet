import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exports Logger object with info/warn/error/debug', async () => {
    const { Logger } = await import('./logger.js');
    expect(Logger.info).toBeTypeOf('function');
    expect(Logger.warn).toBeTypeOf('function');
    expect(Logger.error).toBeTypeOf('function');
    expect(Logger.debug).toBeTypeOf('function');
  });

  it('exports setLevel function', async () => {
    const { setLevel } = await import('./logger.js');
    expect(setLevel).toBeTypeOf('function');
  });

  describe('log level filtering', () => {
    it('info passes at default level', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger } = await import('./logger.js');
      Logger.info('test');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('debug is suppressed at default level', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger } = await import('./logger.js');
      Logger.debug('should not appear');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('setLevel(debug) enables debug logs', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, setLevel } = await import('./logger.js');
      setLevel('debug');
      Logger.debug('now visible');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('setLevel(error) suppresses info and warn', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, setLevel } = await import('./logger.js');
      setLevel('error');
      Logger.info('hidden');
      Logger.warn('hidden');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('error passes at error level', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { Logger, setLevel } = await import('./logger.js');
      setLevel('error');
      Logger.error('visible');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
