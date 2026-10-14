import * as React from "react";

/**
 * Button variants map to the design-system action hierarchy.
 * - primary: solid brand-blue, the one main action per view
 * - secondary: bordered neutral surface, paired with a primary
 * - tertiary: transparent, low-emphasis inline action
 * - danger / success: destructive and confirming semantic actions
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis / semantic role. @default "primary" */
  variant?: "primary" | "secondary" | "tertiary" | "danger" | "success";
  /** Control height. Text size stays constant across sizes. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Stretch to fill the container width. */
  block?: boolean;
  /** Swap the label for an inline spinner and disable interaction. */
  loading?: boolean;
  disabled?: boolean;
  /** Font Awesome Free class for a leading icon, e.g. "fa-plus". */
  leadingIcon?: string;
  /** Font Awesome Free class for a trailing icon, e.g. "fa-arrow-right". */
  trailingIcon?: string;
  className?: string;
  children?: React.ReactNode;
}

export declare function Button(props: ButtonProps): JSX.Element;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Font Awesome Free class, e.g. "fa-gear". */
  icon: string;
  /** Required accessible label (icon-only button has no text). */
  label: string;
  size?: "sm" | "lg";
  className?: string;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
