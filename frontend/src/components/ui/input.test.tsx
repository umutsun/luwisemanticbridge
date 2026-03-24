import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './input';

describe('Input Component', () => {
    it('renders input element', () => {
        render(<Input placeholder="Enter text" />);
        expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('handles value changes', () => {
        const handleChange = jest.fn();
        render(<Input onChange={handleChange} />);

        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'test value' } });

        expect(handleChange).toHaveBeenCalled();
    });

    it('applies custom className', () => {
        render(<Input className="custom-input" />);
        const input = screen.getByRole('textbox');
        expect(input).toHaveClass('custom-input');
    });

    it('disables input when disabled prop is true', () => {
        render(<Input disabled />);
        expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('sets input type correctly', () => {
        const { rerender } = render(<Input type="text" />);
        expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text');

        rerender(<Input type="email" />);
        expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');

        rerender(<Input type="password" />);
        const passwordInput = document.querySelector('input[type="password"]');
        expect(passwordInput).toBeInTheDocument();
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLInputElement>();
        render(<Input ref={ref} />);

        expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('applies default styles', () => {
        render(<Input />);
        const input = screen.getByRole('textbox');

        expect(input).toHaveClass('flex', 'h-10', 'w-full', 'rounded-md', 'border');
    });

    it('handles focus and blur events', () => {
        const handleFocus = jest.fn();
        const handleBlur = jest.fn();

        render(<Input onFocus={handleFocus} onBlur={handleBlur} />);
        const input = screen.getByRole('textbox');

        fireEvent.focus(input);
        expect(handleFocus).toHaveBeenCalled();

        fireEvent.blur(input);
        expect(handleBlur).toHaveBeenCalled();
    });

    it('renders with placeholder', () => {
        render(<Input placeholder="Search..." />);
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('handles controlled input', () => {
        const { rerender } = render(<Input value="initial" onChange={() => { }} />);
        expect(screen.getByRole('textbox')).toHaveValue('initial');

        rerender(<Input value="updated" onChange={() => { }} />);
        expect(screen.getByRole('textbox')).toHaveValue('updated');
    });
});
