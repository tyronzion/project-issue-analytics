import * as React from "react";

export interface Person {
  initials: string;
  name: string;
  role: string;
  /** Availability — drives the status badge colour. @default "Available" */
  status?: "Available" | "Busy" | "Away" | string;
  location?: string;
  /** Rating value, e.g. "4.9". */
  rating?: string | number;
  /** Hourly rate (number); rendered with `currency`. */
  rate?: number;
  /** Currency symbol. @default "$" */
  currency?: string;
}

/**
 * PersonCard — recruiting / team-member tile. Avatar, identity, availability,
 * meta, hourly rate, and View/Hire actions. "Hire" disables unless Available.
 */
export interface PersonCardProps {
  person: Person;
  onView?: () => void;
  onHire?: () => void;
  className?: string;
}
export declare function PersonCard(props: PersonCardProps): JSX.Element;
