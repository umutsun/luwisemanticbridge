import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch Component', () => {
    it('renders switch', () => {
        render(<Switch />);
        const switchElement = screen.getByRole('switch');
        expect(switchElement).toBeInTheDocument();
    });

    it('handles checked state', () => {
        const handleChange = jest.fn();
        render(<Switch onCheckedChange={handleChange} />);

        const switchElement = screen.getByRole('switch');
        fireEvent.click(switchElement);

        expect(handleChange).toHaveBeenCalled();
    });

    it('disables switch when disabled prop is true', () => {
        render(<Switch disabled />);
        expect(screen.getByRole('switch')).toBeDisabled();
    });

    it('applies custom className', () => {
        render(<Switch className="custom-switch" />);
        const switchElement = screen.getByRole('switch');
        expect(switchElement).toHaveClass('custom-switch');
    });

    it('renders in checked state', () => {
        render(<Switch checked={true} />);
        const switchElement = screen.getByRole('switch');
        expect(switchElement).toHaveAttribute('data-state', 'checked');
    });

    it('renders in unchecked state', () => {
        render(<Switch checked={false} />);
        const switchElement = screen.getByRole('switch');
        expect(switchElement).toHaveAttribute('data-state', 'unchecked');
    });

    it('toggles between checked and unchecked', () => {
        const { rerender } = render(<Switch checked={false} />);
        expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');

        rerender(<Switch checked={true} />);
        expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLButtonElement>();
        render(<Switch ref={ref} />);

        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('applies default styles', () => {
        render(<Switch />);
        const switchElement = screen.getByRole('switch');

        expect(switchElement).toHaveClass(
            'peer',
            'inline-flex',
            'h-5',
            'w-9',
            'shrink-0',
            'cursor-pointer',
            'items-center',
            'rounded-full'
        );
    });
});
