import React from 'react';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge Component', () => {
    it('renders badge with text', () => {
        render(<Badge>Test Badge</Badge>);
        expect(screen.getByText('Test Badge')).toBeInTheDocument();
    });

    it('applies default variant styles', () => {
        const { container } = render(<Badge>Default</Badge>);
        expect(container.firstChild).toHaveClass('bg-primary/10');
    });

    it('applies secondary variant styles', () => {
        const { container } = render(<Badge variant="secondary">Secondary</Badge>);
        expect(container.firstChild).toHaveClass('bg-secondary/50');
    });

    it('applies error variant styles', () => {
        const { container } = render(<Badge variant="error">Error</Badge>);
        expect(container.firstChild).toHaveClass('bg-red-50');
    });

    it('applies success variant styles', () => {
        const { container } = render(<Badge variant="success">Success</Badge>);
        expect(container.firstChild).toHaveClass('bg-green-50');
    });

    it('applies warning variant styles', () => {
        const { container } = render(<Badge variant="warning">Warning</Badge>);
        expect(container.firstChild).toHaveClass('bg-yellow-50');
    });

    it('applies info variant styles', () => {
        const { container } = render(<Badge variant="info">Info</Badge>);
        expect(container.firstChild).toHaveClass('bg-blue-50');
    });

    it('applies outline variant styles', () => {
        const { container } = render(<Badge variant="outline">Outline</Badge>);
        expect(container.firstChild).toHaveClass('bg-background');
    });

    it('applies custom className', () => {
        const { container } = render(<Badge className="custom-badge">Custom</Badge>);
        expect(container.firstChild).toHaveClass('custom-badge');
    });

    it('renders with different content types', () => {
        const { rerender } = render(<Badge>Text</Badge>);
        expect(screen.getByText('Text')).toBeInTheDocument();

        rerender(<Badge>123</Badge>);
        expect(screen.getByText('123')).toBeInTheDocument();

        rerender(<Badge><span>Nested</span></Badge>);
        expect(screen.getByText('Nested')).toBeInTheDocument();
    });

    it('applies base styles to all variants', () => {
        const { container } = render(<Badge>Badge</Badge>);
        expect(container.firstChild).toHaveClass(
            'inline-flex',
            'items-center',
            'rounded-full',
            'text-xs',
            'font-medium'
        );
    });

    it('renders multiple badges correctly', () => {
        render(
            <div>
                <Badge>Badge 1</Badge>
                <Badge variant="secondary">Badge 2</Badge>
                <Badge variant="error">Badge 3</Badge>
            </div>
        );

        expect(screen.getByText('Badge 1')).toBeInTheDocument();
        expect(screen.getByText('Badge 2')).toBeInTheDocument();
        expect(screen.getByText('Badge 3')).toBeInTheDocument();
    });

    it('applies size variants correctly', () => {
        const { container, rerender } = render(<Badge size="sm">Small</Badge>);
        expect(container.firstChild).toHaveClass('px-1.5', 'py-0.5');

        rerender(<Badge size="md">Medium</Badge>);
        expect(container.firstChild).toHaveClass('px-2', 'py-1');

        rerender(<Badge size="lg">Large</Badge>);
        expect(container.firstChild).toHaveClass('px-3', 'py-1.5');
    });
});
