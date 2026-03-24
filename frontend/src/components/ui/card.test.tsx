import React from 'react';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

describe('Card Component', () => {
    it('renders card with all sections', () => {
        render(
            <Card>
                <CardHeader>
                    <CardTitle>Test Title</CardTitle>
                    <CardDescription>Test Description</CardDescription>
                </CardHeader>
                <CardContent>Test Content</CardContent>
                <CardFooter>Test Footer</CardFooter>
            </Card>
        );

        expect(screen.getByText('Test Title')).toBeInTheDocument();
        expect(screen.getByText('Test Description')).toBeInTheDocument();
        expect(screen.getByText('Test Content')).toBeInTheDocument();
        expect(screen.getByText('Test Footer')).toBeInTheDocument();
    });

    it('applies custom className to Card', () => {
        const { container } = render(
            <Card className="custom-class">Content</Card>
        );

        expect(container.firstChild).toHaveClass('custom-class');
    });

    it('renders CardHeader with proper structure', () => {
        const { container } = render(
            <CardHeader>
                <CardTitle>Title</CardTitle>
            </CardHeader>
        );

        expect(container.firstChild).toHaveClass('flex', 'flex-col', 'space-y-1.5');
    });

    it('renders CardTitle with heading element', () => {
        render(<CardTitle>My Title</CardTitle>);

        const title = screen.getByText('My Title');
        expect(title.tagName).toBe('H3');
    });

    it('renders CardDescription with muted text', () => {
        const { container } = render(
            <CardDescription>Description text</CardDescription>
        );

        expect(container.firstChild).toHaveClass('text-muted-foreground');
    });

    it('renders CardContent with padding', () => {
        const { container } = render(
            <CardContent>Content</CardContent>
        );

        expect(container.firstChild).toHaveClass('p-6', 'pt-0');
    });

    it('renders CardFooter with flex layout', () => {
        const { container } = render(
            <CardFooter>Footer</CardFooter>
        );

        expect(container.firstChild).toHaveClass('flex', 'items-center');
    });

    it('renders nested cards correctly', () => {
        render(
            <Card>
                <CardContent>
                    <Card>
                        <CardContent>Nested Card</CardContent>
                    </Card>
                </CardContent>
            </Card>
        );

        expect(screen.getByText('Nested Card')).toBeInTheDocument();
    });
});
