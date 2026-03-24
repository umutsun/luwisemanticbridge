import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox Component', () => {
    it('renders checkbox', () => {
        render(<Checkbox />);
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toBeInTheDocument();
    });

    it('handles checked state', () => {
        const handleChange = jest.fn();
        render(<Checkbox onCheckedChange={handleChange} />);

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(handleChange).toHaveBeenCalled();
    });

    it('disables checkbox when disabled prop is true', () => {
        render(<Checkbox disabled />);
        expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('applies custom className', () => {
        render(<Checkbox className="custom-checkbox" />);
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveClass('custom-checkbox');
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLButtonElement>();
        render(<Checkbox ref={ref} />);

        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });

    it('renders in checked state', () => {
        render(<Checkbox checked={true} />);
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('data-state', 'checked');
    });

    it('renders in unchecked state', () => {
        render(<Checkbox checked={false} />);
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    });

    it('handles indeterminate state', () => {
        render(<Checkbox checked="indeterminate" />);
        const checkbox = screen.getByRole('checkbox');
        expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
    });

    it('applies default styles', () => {
        render(<Checkbox />);
        const checkbox = screen.getByRole('checkbox');

        expect(checkbox).toHaveClass(
            'peer',
            'h-4',
            'w-4',
            'shrink-0',
            'rounded-sm',
            'border'
        );
    });

    it('toggles between checked and unchecked', () => {
        const { rerender } = render(<Checkbox checked={false} />);
        expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'unchecked');

        rerender(<Checkbox checked={true} />);
        expect(screen.getByRole('checkbox')).toHaveAttribute('data-state', 'checked');
    });
});
