import * as React from "react";

/**
 * Card — the core container. Resilient by default: equal-height in grid rows,
 * long content wraps, content top-aligns. Pick a variant for tinted or
 * solid-brand backgrounds (brand variants render white text inside).
 */
export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  variant?:
    | "tinted-warm"
    | "tinted-cool"
    | "tinted-brand"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "brand-primary"
    | "brand-secondary"
    | "feature-03"
    | "feature-05";
  /** Hover lift + border accent — use for clickable cards. */
  interactive?: boolean;
  /** Tighter padding and radius. */
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}
export declare function Card(props: CardProps): JSX.Element;

export interface CardHeaderProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned tools slot (icon buttons, menus). */
  tools?: React.ReactNode;
  className?: string;
}
export declare function CardHeader(props: CardHeaderProps): JSX.Element;

export interface CardFooterProps {
  className?: string;
  children?: React.ReactNode;
}
export declare function CardFooter(props: CardFooterProps): JSX.Element;

/** Pane — canonical labelled sub-section wrapper. First in a sequence uses `first`. */
export interface PaneProps {
  first?: boolean;
  className?: string;
  children?: React.ReactNode;
}
export declare function Pane(props: PaneProps): JSX.Element;
