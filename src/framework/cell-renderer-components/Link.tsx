import * as React from 'react';

export interface LinkProps {
    text: string;
    href: string;
    className?: string;
}

/**
 * A reusable Link component for use throughout the application.
 * Provides consistent styling and behavior for links.
 */
export const Link: React.FC<LinkProps> = ({
    text,
    href,
    className = "text-blue-500 underline hover:text-blue-700 cursor-pointer",
}) => {
    return (
        <a
            href={href}
            className={className}
        >
            {text}
        </a>
    );
};

export default Link;
