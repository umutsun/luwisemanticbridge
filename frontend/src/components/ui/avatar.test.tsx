import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';

describe('Avatar Component', () => {
    it('renders avatar with fallback', () => {
        render(
            <Avatar>
                <AvatarFallback>UA</AvatarFallback>
            </Avatar>
        );

        expect(screen.getByText('UA')).toBeInTheDocument();
    });

    it('renders fallback without image', () => {
        render(
            <Avatar>
                <AvatarFallback>JD</AvatarFallback>
            </Avatar>
        );

        expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('applies custom className to Avatar', () => {
        const { container } = render(
            <Avatar className="custom-avatar">
                <AvatarFallback>UA</AvatarFallback>
            </Avatar>
        );

        expect(container.firstChild).toHaveClass('custom-avatar');
    });

    it('applies default styles to Avatar', () => {
        const { container } = render(
            <Avatar>
                <AvatarFallback>UA</AvatarFallback>
            </Avatar>
        );

        expect(container.firstChild).toHaveClass('relative', 'flex', 'h-10', 'w-10', 'shrink-0', 'overflow-hidden', 'rounded-full');
    });

    it('renders AvatarFallback with centered text', () => {
        render(
            <Avatar>
                <AvatarFallback>AB</AvatarFallback>
            </Avatar>
        );

        const fallback = screen.getByText('AB');
        expect(fallback).toHaveClass('flex', 'h-full', 'w-full', 'items-center', 'justify-center');
    });

    it('renders multiple avatars', () => {
        render(
            <div>
                <Avatar>
                    <AvatarFallback>A1</AvatarFallback>
                </Avatar>
                <Avatar>
                    <AvatarFallback>A2</AvatarFallback>
                </Avatar>
            </div>
        );

        expect(screen.getByText('A1')).toBeInTheDocument();
        expect(screen.getByText('A2')).toBeInTheDocument();
    });

    it('renders AvatarImage component', () => {
        const { container } = render(
            <Avatar>
                <AvatarImage src="https://example.com/avatar.jpg" />
                <AvatarFallback>UA</AvatarFallback>
            </Avatar>
        );

        // Avatar component renders successfully with AvatarImage
        expect(container.firstChild).toBeInTheDocument();
        expect(container.firstChild).toHaveClass('relative');
    });

    it('shows fallback when image src is invalid', async () => {
        render(
            <Avatar>
                <AvatarImage src="invalid-url" />
                <AvatarFallback>UA</AvatarFallback>
            </Avatar>
        );

        // Fallback should be visible
        await waitFor(() => {
            expect(screen.getByText('UA')).toBeInTheDocument();
        });
    });

    it('renders with different sizes via className', () => {
        const { container } = render(
            <Avatar className="h-12 w-12">
                <AvatarFallback>LG</AvatarFallback>
            </Avatar>
        );

        expect(container.firstChild).toHaveClass('h-12', 'w-12');
    });

    it('forwards ref correctly', () => {
        const ref = React.createRef<HTMLSpanElement>();
        render(
            <Avatar ref={ref}>
                <AvatarFallback>RF</AvatarFallback>
            </Avatar>
        );

        expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });
});
