import * as React from "react";

/** Status pill. Variant maps to the semantic feedback colours. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "lg";
  className?: string;
  children?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;

/** Avatar — initials or photo, with an optional presence status dot. */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  src?: string;
  alt?: string;
  initials?: string;
  status?: "online" | "busy" | "away" | "offline";
  neutral?: boolean;
  className?: string;
}
export declare function Avatar(props: AvatarProps): JSX.Element;

export interface AvatarStackProps {
  className?: string;
  children?: React.ReactNode;
}
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;

/** StatTile — a dashboard metric card: label, value, optional trend badge. */
export interface StatTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small trailing unit, e.g. "hrs". */
  unit?: string;
  /** Trend badge text, e.g. "+12%". */
  delta?: React.ReactNode;
  deltaVariant?: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
  /** Font Awesome Free icon class for the illustrated variant. */
  icon?: string;
  className?: string;
}
export declare function StatTile(props: StatTileProps): JSX.Element;
