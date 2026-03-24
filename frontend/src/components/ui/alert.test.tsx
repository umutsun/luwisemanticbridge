import React from 'react';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

describe('Alert Component', () => {
    it('renders alert with title and description', () => {
        render(
            <Alert>
                <AlertTitle>Alert Title</AlertTitle>
                <AlertDescription>Alert Description</AlertDescription>
            </Alert>
        );

        expect(screen.getByText('Alert Title')).toBeInTheDocument();
        expect(screen.getByText('Alert Description')).toBeInTheDocument();
    });

    it('applies default variant styles', () => {
        const { container } = render(<Alert>Default Alert</Alert>);
        expect(container.firstChild).toHaveClass('bg-background');
    });

    it('applies destructive variant styles', () => {
        const { container } = render(
            <Alert variant="destructive">Destructive Alert</Alert>
        );
        expect(container.firstChild).toHaveClass('border-destructive/50');
    });

    it('applies custom className', () => {
        const { container } = render(
            <Alert className="custom-alert">Custom</Alert>
        );
        expect(container.firstChild).toHaveClass('custom-alert');
    });

    it('renders AlertTitle with proper heading', () => {
        render(<AlertTitle>Title</AlertTitle>);
        const title = screen.getByText('Title');
        expect(title.tagName).toBe('H5');
    });

    it('renders AlertDescription with proper styling', () => {
        const { container } = render(
            <AlertDescription>Description</AlertDescription>
        );
        expect(container.firstChild).toHaveClass('text-sm');
    });

    it('renders alert with icon', () => {
        const Icon = () => <svg data-testid="alert-icon">Icon</svg>;
        render(
            <Alert>
                <Icon />
                <AlertTitle>Title</AlertTitle>
                <AlertDescription>Description</AlertDescription>
            </Alert>
        );

        expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
    });

    it('applies base styles to all variants', () => {
        const { container } = render(<Alert>Alert</Alert>);
        expect(container.firstChild).toHaveClass(
            'relative',
            'w-full',
            'rounded-lg',
            'border',
            'p-4'
        );
    });

    it('renders multiple alerts correctly', () => {
        render(
            <div>
                <Alert>
                    <AlertTitle>Alert 1</AlertTitle>
                </Alert>
                <Alert variant="destructive">
                    <AlertTitle>Alert 2</AlertTitle>
                </Alert>
            </div>
        );

        expect(screen.getByText('Alert 1')).toBeInTheDocument();
        expect(screen.getByText('Alert 2')).toBeInTheDocument();
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLDivElement>();
        render(<Alert ref={ref}>Alert</Alert>);

        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
});
