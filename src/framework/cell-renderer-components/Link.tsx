// React import removed (unused with new JSX transform)

export interface LinkProps {
    text: string;
    href: string;
    className?: string;
}

/**
 * A reusable Link component for use throughout the application.
 * Provides consistent styling and behavior for links.
 */
export function Link({ text, href, className = "tw:text-blue-500 tw:underline hover:tw:text-blue-700 tw:cursor-pointer" }: LinkProps) {
    return (
        <a href={href} className={className}>
            {text}
        </a>
    );
}

export default Link;
