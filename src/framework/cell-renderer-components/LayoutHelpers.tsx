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
        case 'start': return 'tw:items-start';
        case 'center': return 'tw:items-center';
        case 'end': return 'tw:items-end';
        case 'stretch': return 'tw:items-stretch';
        case 'baseline': return 'tw:items-baseline';
        default: return '';
    }
}

function getJustifyClass(justify?: string) {
    switch (justify) {
        case 'start': return 'tw:justify-start';
        case 'center': return 'tw:justify-center';
        case 'end': return 'tw:justify-end';
        case 'between': return 'tw:justify-between';
        case 'around': return 'tw:justify-around';
        case 'evenly': return 'tw:justify-evenly';
        default: return '';
    }
}

function getWrapClass(wrap?: string | boolean) {
    if (wrap === true || wrap === 'wrap') return 'tw:flex-wrap';
    if (wrap === 'nowrap') return 'tw:flex-nowrap';
    if (wrap === 'wrap-reverse') return 'tw:flex-wrap-reverse';
    return '';
}

// Horizontal stack (row) with gap
export function FlexRow({ gap = "tw:gap-2", className = "", align, justify, wrap, children }: { gap?: string; className?: string; align?: string; justify?: string; wrap?: string | boolean; children: React.ReactNode }) {
    return (
        <div className={`tw:flex tw:flex-row ${gap} ${getAlignClass(align)} ${getJustifyClass(justify)} ${getWrapClass(wrap)} ${className}`.trim()}>
            {wrapStringChildren(children)}
        </div>
    );
}

// Vertical stack (column) with gap
export function FlexColumn({ gap = "tw:gap-2", className = "", align, justify, children }: { gap?: string; className?: string; align?: string; justify?: string; children: React.ReactNode }) {
    return (
        <div className={`tw:flex tw:flex-col ${gap} ${getAlignClass(align)} ${getJustifyClass(justify)} ${className}`.trim()}>
            {wrapStringChildren(children)}
        </div>
    );
}

// Spacer for use in flex layouts
export function Spacer() {
    return <div className="tw:flex-1" />;
}

// FormattedDate: formats a date string using toLocaleString
export function DateTime({ date, locale = undefined, options = undefined, className = "" }: { date: string; locale?: string; options?: Intl.DateTimeFormatOptions; className?: string }) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return <span className={className}>{date}</span>;
    return <span className={className}>{d.toLocaleString(locale, options)}</span>;
}
