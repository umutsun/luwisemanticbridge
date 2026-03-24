import React from 'react';
import { render } from '@testing-library/react';
import { Separator } from './separator';

describe('Separator Component', () => {
    it('renders separator', () => {
        const { container } = render(<Separator />);
        const separator = container.firstChild;
        expect(separator).toBeInTheDocument();
    });

    it('renders horizontal separator by default', () => {
        const { container } = render(<Separator />);
        const separator = container.firstChild;
        expect(separator).toHaveClass('h-[1px]', 'w-full');
    });

    it('renders vertical separator', () => {
        const { container } = render(<Separator orientation="vertical" />);
        const separator = container.firstChild;
        expect(separator).toHaveClass('h-full', 'w-[1px]');
    });

    it('applies custom className', () => {
        const { container } = render(<Separator className="custom-separator" />);
        expect(container.firstChild).toHaveClass('custom-separator');
    });

    it('applies horizontal styles', () => {
        const { container } = render(<Separator orientation="horizontal" />);
        expect(container.firstChild).toHaveClass('h-[1px]', 'w-full');
    });

    it('applies vertical styles', () => {
        const { container } = render(<Separator orientation="vertical" />);
        expect(container.firstChild).toHaveClass('h-full', 'w-[1px]');
    });

    it('is decorative by default', () => {
        const { container } = render(<Separator />);
        const separator = container.firstChild;
        expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('can be non-decorative', () => {
        const { container } = render(<Separator decorative={false} />);
        const separator = container.firstChild;
        expect(separator).toBeInTheDocument();
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLDivElement>();
        render(<Separator ref={ref} />);

        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('applies default background color', () => {
        const { container } = render(<Separator />);
        expect(container.firstChild).toHaveClass('bg-border');
    });

    it('applies shrink-0 class', () => {
        const { container } = render(<Separator />);
        expect(container.firstChild).toHaveClass('shrink-0');
    });
});
