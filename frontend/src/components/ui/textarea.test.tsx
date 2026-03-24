import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea Component', () => {
    it('renders textarea element', () => {
        render(<Textarea placeholder="Enter text" />);
        expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });

    it('handles value changes', () => {
        const handleChange = jest.fn();
        render(<Textarea onChange={handleChange} />);

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'test value' } });

        expect(handleChange).toHaveBeenCalled();
    });

    it('applies custom className', () => {
        render(<Textarea className="custom-textarea" />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toHaveClass('custom-textarea');
    });

    it('disables textarea when disabled prop is true', () => {
        render(<Textarea disabled />);
        expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLTextAreaElement>();
        render(<Textarea ref={ref} />);

        expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('applies default styles', () => {
        render(<Textarea />);
        const textarea = screen.getByRole('textbox');

        expect(textarea).toHaveClass(
            'flex',
            'min-h-[80px]',
            'w-full',
            'rounded-md',
            'border'
        );
    });

    it('handles focus and blur events', () => {
        const handleFocus = jest.fn();
        const handleBlur = jest.fn();

        render(<Textarea onFocus={handleFocus} onBlur={handleBlur} />);
        const textarea = screen.getByRole('textbox');

        fireEvent.focus(textarea);
        expect(handleFocus).toHaveBeenCalled();

        fireEvent.blur(textarea);
        expect(handleBlur).toHaveBeenCalled();
    });

    it('renders with placeholder', () => {
        render(<Textarea placeholder="Type here..." />);
        expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
    });

    it('handles controlled textarea', () => {
        const { rerender } = render(<Textarea value="initial" onChange={() => { }} />);
        expect(screen.getByRole('textbox')).toHaveValue('initial');

        rerender(<Textarea value="updated" onChange={() => { }} />);
        expect(screen.getByRole('textbox')).toHaveValue('updated');
    });

    it('handles multiline text', () => {
        const multilineText = 'Line 1\nLine 2\nLine 3';
        render(<Textarea value={multilineText} onChange={() => { }} />);
        expect(screen.getByRole('textbox')).toHaveValue(multilineText);
    });
});
