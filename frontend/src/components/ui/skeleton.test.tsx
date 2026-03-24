import React from 'react';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton Component', () => {
    it('renders skeleton', () => {
        const { container } = render(<Skeleton />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('applies default styles', () => {
        const { container } = render(<Skeleton />);
        expect(container.firstChild).toHaveClass('animate-pulse', 'rounded-md', 'bg-muted');
    });

    it('applies custom className', () => {
        const { container } = render(<Skeleton className="custom-skeleton" />);
        expect(container.firstChild).toHaveClass('custom-skeleton');
    });

    it('renders with custom dimensions', () => {
        const { container } = render(<Skeleton className="h-12 w-12" />);
        expect(container.firstChild).toHaveClass('h-12', 'w-12');
    });

    it('renders multiple skeletons', () => {
        render(
            <div>
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
            </div>
        );

        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons).toHaveLength(2);
    });

    it('has pulse animation', () => {
        const { container } = render(<Skeleton />);
        expect(container.firstChild).toHaveClass('animate-pulse');
    });

    it('renders as different HTML elements', () => {
        const { container } = render(<Skeleton />);
        expect(container.firstChild?.tagName).toBe('DIV');
    });
});
