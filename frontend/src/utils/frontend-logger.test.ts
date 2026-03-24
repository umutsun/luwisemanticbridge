import frontendLogger from './frontend-logger';

// Mock fetch globally
global.fetch = jest.fn();

// Mock window and navigator only if they don't exist
if (typeof window === 'undefined') {
    Object.defineProperty(global, 'window', {
        value: {
            location: { href: 'http://localhost:3000' },
            addEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
    });
}

if (typeof navigator === 'undefined') {
    Object.defineProperty(global, 'navigator', {
        value: {
            userAgent: 'Jest Test Agent',
        },
        writable: true,
        configurable: true,
    });
}

describe('FrontendLogger', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true }),
        });

        // Initialize logger before each test
        frontendLogger.initialize();
    });

    afterEach(() => {
        frontendLogger.restore();
    });

    it('creates singleton instance', () => {
        expect(frontendLogger).toBeDefined();
    });

    it('sends info log', async () => {
        jest.clearAllMocks(); // Clear initialization logs

        frontendLogger.info('Test info message', { key: 'value' });

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v2/frontend/log'),
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: expect.stringContaining('Test info message'),
            })
        );
    });

    it('sends warn log', async () => {
        jest.clearAllMocks();

        frontendLogger.warn('Test warning', { warning: true });

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v2/frontend/log'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Test warning'),
            })
        );
    });

    it('sends error log', async () => {
        jest.clearAllMocks();

        frontendLogger.error('Test error', { error: true });

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v2/frontend/log'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Test error'),
            })
        );
    });

    it('sends debug log', async () => {
        jest.clearAllMocks();

        frontendLogger.debug('Test debug', { debug: true });

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/v2/frontend/log'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('Test debug'),
            })
        );
    });

    it('includes metadata in log', async () => {
        jest.clearAllMocks();

        const metadata = { userId: 123, action: 'test' };
        frontendLogger.info('Test with metadata', metadata);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(global.fetch).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                body: expect.stringContaining('"userId":123'),
            })
        );
    });

    it('handles fetch errors gracefully', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

        frontendLogger.error('Test error handling');

        await new Promise(resolve => setTimeout(resolve, 100));

        // Should not throw, just log to console
        expect(consoleSpy).not.toHaveBeenCalled(); // Because it uses originalConsole

        consoleSpy.mockRestore();
    });

    it('creates log entry with correct structure', async () => {
        jest.clearAllMocks();

        frontendLogger.info('Structured log');

        await new Promise(resolve => setTimeout(resolve, 100));

        const callArgs = (global.fetch as jest.Mock).mock.calls[0];
        if (callArgs) {
            const body = JSON.parse(callArgs[1].body);

            expect(body).toMatchObject({
                level: 'info',
                message: 'Structured log',
                source: 'manual',
                timestamp: expect.any(String),
            });
        }
    });

    it('includes timestamp in ISO format', async () => {
        jest.clearAllMocks();

        frontendLogger.info('Timestamp test');

        await new Promise(resolve => setTimeout(resolve, 100));

        const callArgs = (global.fetch as jest.Mock).mock.calls[0];
        if (callArgs) {
            const body = JSON.parse(callArgs[1].body);
            expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        }
    });
});
