import React from 'react';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('Label Component', () => {
    it('renders label with text', () => {
        render(<Label>Test Label</Label>);
        expect(screen.getByText('Test Label')).toBeInTheDocument();
    });

    it('applies custom className', () => {
        const { container } = render(<Label className="custom-label">Label</Label>);
        expect(container.firstChild).toHaveClass('custom-label');
    });

    it('applies default styles', () => {
        const { container } = render(<Label>Label</Label>);
        expect(container.firstChild).toHaveClass(
            'text-sm',
            'font-medium',
            'leading-none'
        );
    });

    it('associates with input using htmlFor', () => {
        render(
            <div>
                <Label htmlFor="test-input">Test Label</Label>
                <input id="test-input" />
            </div>
        );

        const label = screen.getByText('Test Label');
        expect(label).toHaveAttribute('for', 'test-input');
    });

    it('renders as label element', () => {
        render(<Label>Label</Label>);
        const label = screen.getByText('Label');
        expect(label.tagName).toBe('LABEL');
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLLabelElement>();
        render(<Label ref={ref}>Label</Label>);

        expect(ref.current).toBeInstanceOf(HTMLLabelElement);
    });

    it('renders with nested elements', () => {
        render(
            <Label>
                <span>Nested</span> Content
            </Label>
        );

        expect(screen.getByText('Nested')).toBeInTheDocument();
        expect(screen.getByText(/Content/)).toBeInTheDocument();
    });
});
