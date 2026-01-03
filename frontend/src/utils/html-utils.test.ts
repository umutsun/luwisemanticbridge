import { stripHtml, truncateText, cleanSourceTitle } from './html-utils';

describe('HTML Utils', () => {
    describe('stripHtml', () => {
        it('should remove simple HTML tags', () => {
            const input = '<p>Hello <b>World</b></p>';
            expect(stripHtml(input)).toBe('Hello World');
        });

        it('should decode HTML entities', () => {
            const input = 'Tom &amp; Jerry';
            expect(stripHtml(input)).toBe('Tom & Jerry');
        });

        it('should handle Turkish characters', () => {
            const input = '&#350;anl&#305;urfa';
            expect(stripHtml(input)).toBe('Şanlıurfa');
        });

        it('should handle null or undefined', () => {
            expect(stripHtml(null)).toBe('');
            expect(stripHtml(undefined)).toBe('');
        });

        it('should trim whitespace', () => {
            const input = '   <p>  Hello </p>  ';
            expect(stripHtml(input)).toBe('Hello');
        });
    });

    describe('truncateText', () => {
        it('should not truncate text shorter than maxLength', () => {
            const text = 'Short text';
            expect(truncateText(text, 20)).toBe('Short text');
        });

        it('should truncate text longer than maxLength', () => {
            const text = 'This is a very long text that needs to be truncated';
            const maxLength = 20;
            const result = truncateText(text, maxLength);
            expect(result.length).toBeLessThanOrEqual(maxLength);
            expect(result.endsWith('...')).toBe(true);
        });

        it('should strip HTML before truncating', () => {
            const text = '<p>This is <b>long</b> text</p>';
            expect(truncateText(text, 10)).toBe('This is...');
        });
    });

    describe('cleanSourceTitle', () => {
        it('should clean common prefixes', () => {
            expect(cleanSourceTitle('sorucevap - My Question')).toBe('My Question');
            expect(cleanSourceTitle('Makaleler - My Article')).toBe('My Article');
        });

        it('should remove IDs suffix', () => {
            expect(cleanSourceTitle('My Document - ID: 12345')).toBe('My Document');
        });

        it('should remove parenthetical suffixes', () => {
            expect(cleanSourceTitle('Some Title (2024 db)')).toBe('Some Title');
        });
    });
});
