import * as React from "react";

/**
 * Field — label + control + hint/error scaffold. Wrap any input.
 * Validation policy controls WHEN the error shows; the default
 * "validate-on-submit" keeps the field quiet until the form is submitted.
 */
export interface FieldProps {
  label?: React.ReactNode;
  /** Non-error helper text shown below the control. */
  hint?: React.ReactNode;
  /** Error message; presence flips the field to its invalid state. */
  error?: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  /** When errors appear. @default "validate-on-submit" */
  policy?: "validate-on-submit" | "validate-on-blur" | "validate-eager";
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
}
export declare function Field(props: FieldProps): JSX.Element;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  className?: string;
}
export declare function Input(props: InputProps): JSX.Element;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  className?: string;
}
export declare function Textarea(props: TextareaProps): JSX.Element;

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  className?: string;
  children?: React.ReactNode;
}
export declare function Select(props: SelectProps): JSX.Element;

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Text label rendered beside the toggle. */
  label?: React.ReactNode;
  className?: string;
}
export declare function Switch(props: SwitchProps): JSX.Element;

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  className?: string;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholder?: string;
  className?: string;
}
export declare function SearchInput(props: SearchInputProps): JSX.Element;
