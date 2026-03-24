import React from 'react';
import { render } from '@testing-library/react';
import { Progress } from './progress';

describe('Progress Component', () => {
    it('renders progress bar', () => {
        const { container } = render(<Progress value={50} />);
        const progressBar = container.firstChild;
        expect(progressBar).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<Progress value={50} className="custom-progress" />);
        expect(container.firstChild).toHaveClass('custom-progress');
    });

    it('renders with 0% progress', () => {
        const { container } = render(<Progress value={0} />);
        const progressBar = container.firstChild;
        expect(progressBar).toBeInTheDocument();
    });

    it('renders with 100% progress', () => {
        const { container } = render(<Progress value={100} />);
        const progressBar = container.firstChild;
        expect(progressBar).toBeInTheDocument();
    });

    it('applies default styles', () => {
        const { container } = render(<Progress value={50} />);
        expect(container.firstChild).toHaveClass(
            'relative',
            'w-full',
            'overflow-hidden',
            'rounded-full',
            'bg-secondary/30'
        );
    });

    it('applies default size (md)', () => {
        const { container } = render(<Progress value={50} />);
        expect(container.firstChild).toHaveClass('h-2');
    });

    it('applies small size', () => {
        const { container } = render(<Progress value={50} size="sm" />);
        expect(container.firstChild).toHaveClass('h-1.5');
    });

    it('applies large size', () => {
        const { container } = render(<Progress value={50} size="lg" />);
        expect(container.firstChild).toHaveClass('h-3');
    });

    it('applies success variant', () => {
        const { container } = render(<Progress value={50} variant="success" />);
        const indicator = container.querySelector('.bg-gradient-to-r');
        expect(indicator).toBeInTheDocument();
    });

    it('applies warning variant', () => {
        const { container } = render(<Progress value={50} variant="warning" />);
        const indicator = container.querySelector('.bg-gradient-to-r');
        expect(indicator).toBeInTheDocument();
    });

    it('applies error variant', () => {
        const { container } = render(<Progress value={50} variant="error" />);
        const indicator = container.querySelector('.bg-gradient-to-r');
        expect(indicator).toBeInTheDocument();
    });

    it('applies gradient variant', () => {
        const { container } = render(<Progress value={50} variant="gradient" />);
        const indicator = container.querySelector('.bg-gradient-to-r');
        expect(indicator).toBeInTheDocument();
    });

    it('applies rainbow variant', () => {
        const { container } = render(<Progress value={50} variant="rainbow" />);
        const indicator = container.querySelector('.bg-gradient-to-r');
        expect(indicator).toBeInTheDocument();
    });

    it('renders indicator with correct transform', () => {
        const { container } = render(<Progress value={60} />);
        const indicator = container.querySelector('.h-full');
        expect(indicator).toHaveStyle({ transform: 'translateX(-40%)' });
    });

    it('handles undefined value', () => {
        const { container } = render(<Progress />);
        const progressBar = container.firstChild;
        expect(progressBar).toBeInTheDocument();
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLDivElement>();
        render(<Progress value={50} ref={ref} />);

        expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('renders with animated prop', () => {
        const { container } = render(<Progress value={50} variant="gradient" animated />);
        expect(container.firstChild).toBeInTheDocument();
    });
});
