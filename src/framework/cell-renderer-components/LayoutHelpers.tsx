import * as React from "react";

function wrapStringChildren(children: React.ReactNode) {
    if (typeof children === "string") {
        return <span>{children}</span>;
    }
    if (Array.isArray(children)) {
        return children.map((child, i) =>
            typeof child === "string" ? <span key={i}>{child}</span> : child
        );
    }
    return children;
}

function getAlignClass(align?: string) {
    switch (align) {
        case 'start': return 'items-start';
        case 'center': return 'items-center';
        case 'end': return 'items-end';
        case 'stretch': return 'items-stretch';
        case 'baseline': return 'items-baseline';
        default: return '';
    }
}

function getJustifyClass(justify?: string) {
    switch (justify) {
        case 'start': return 'justify-start';
        case 'center': return 'justify-center';
        case 'end': return 'justify-end';
        case 'between': return 'justify-between';
        case 'around': return 'justify-around';
        case 'evenly': return 'justify-evenly';
        default: return '';
    }
}

function getWrapClass(wrap?: string | boolean) {
    if (wrap === true || wrap === 'wrap') return 'flex-wrap';
    if (wrap === 'nowrap') return 'flex-nowrap';
    if (wrap === 'wrap-reverse') return 'flex-wrap-reverse';
    return '';
}

// Horizontal stack (row) with gap
export function FlexRow({ gap = "gap-2", className = "", align, justify, wrap, children }: { gap?: string; className?: string; align?: string; justify?: string; wrap?: string | boolean; children: React.ReactNode }) {
    return (
        <div className={`flex flex-row ${gap} ${getAlignClass(align)} ${getJustifyClass(justify)} ${getWrapClass(wrap)} ${className}`.trim()}>
            {wrapStringChildren(children)}
        </div>
    );
}

// Vertical stack (column) with gap
export function FlexColumn({ gap = "gap-2", className = "", align, justify, children }: { gap?: string; className?: string; align?: string; justify?: string; children: React.ReactNode }) {
    return (
        <div className={`flex flex-col ${gap} ${getAlignClass(align)} ${getJustifyClass(justify)} ${className}`.trim()}>
            {wrapStringChildren(children)}
        </div>
    );
}

// Spacer for use in flex layouts
export function Spacer() {
    return <div className="flex-1" />;
}

// FormattedDate: formats a date string using toLocaleString
export function DateTime({ date, locale = undefined, options = undefined, className = "" }: { date: string; locale?: string; options?: Intl.DateTimeFormatOptions; className?: string }) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return <span className={className}>{date}</span>;
    return <span className={className}>{d.toLocaleString(locale, options)}</span>;
}
