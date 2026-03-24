import React from 'react';
import { render } from '@testing-library/react';
import { Spinner } from './spinner';

describe('Spinner Component', () => {
    it('renders spinner', () => {
        const { container } = render(<Spinner />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<Spinner className="custom-spinner" />);
        expect(container.firstChild).toHaveClass('custom-spinner');
    });

    it('renders with default size (md)', () => {
        const { container } = render(<Spinner />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toHaveClass('h-6', 'w-6');
    });

    it('renders with small size', () => {
        const { container } = render(<Spinner size="sm" />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toHaveClass('h-4', 'w-4');
    });

    it('renders with large size', () => {
        const { container } = render(<Spinner size="lg" />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toHaveClass('h-8', 'w-8');
    });

    it('renders with extra large size', () => {
        const { container } = render(<Spinner size="xl" />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toHaveClass('h-12', 'w-12');
    });

    it('has spin animation', () => {
        const { container } = render(<Spinner />);
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toHaveClass('animate-spin');
    });

    it('renders with text', () => {
        const { getByText } = render(<Spinner text="Loading..." />);
        expect(getByText('Loading...')).toBeInTheDocument();
    });

    it('renders without text by default', () => {
        const { container } = render(<Spinner />);
        const text = container.querySelector('p');
        expect(text).not.toBeInTheDocument();
    });
});
