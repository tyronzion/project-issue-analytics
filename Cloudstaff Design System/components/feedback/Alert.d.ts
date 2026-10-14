import * as React from "react";

/**
 * Alert — a non-blocking contextual notice. Follow the notification hierarchy:
 * tile → banner → … → modal. An alert/banner is tier 2 (important, non-blocking).
 */
export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "info" | "success" | "warning" | "danger";
  /** Bold lead-in text. */
  title?: React.ReactNode;
  /** Override the default Font Awesome icon for the variant. */
  icon?: string;
  /** Tighter inline banner padding. */
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}
export declare function Alert(props: AlertProps): JSX.Element;

/** EmptyState — "nothing here yet" placeholder. Give it exactly one action. */
export interface EmptyStateProps {
  /** Font Awesome Free icon class. @default "fa-inbox" */
  icon?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** A single primary action (e.g. a <Button>). */
  action?: React.ReactNode;
  className?: string;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
