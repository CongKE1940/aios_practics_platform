import {
  forwardRef,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from "react";

type InputVariant = "default" | "compact";
type ButtonVariant = "primary" | "ghost" | "neutral";

type ClearableInputType = "text" | "search" | "email" | "password" | "number" | "tel" | "url" | "date" | "datetime-local" | "month" | "time";

export interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  type?: ClearableInputType;
  value: string | number;
  onValueChange(value: string): void;
  variant?: InputVariant;
  clearable?: boolean;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(function FormInput(
  { className, clearable = true, disabled, onValueChange, type = "text", value, variant = "default", ...props },
  ref
) {
  const hasValue = String(value ?? "").length > 0;
  const inputClassName = buildClassName("ui-form-control__native", className);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value);
  }

  return (
    <span className={buildClassName("ui-form-control", `ui-form-control--${variant}`, disabled ? "is-disabled" : "", clearable ? "is-clearable" : "")}>
      <input {...props} ref={ref} className={inputClassName} type={type} value={value} disabled={disabled} onChange={handleChange} />
      {clearable && hasValue && !disabled ? <ControlClearButton onClear={() => onValueChange("")} /> : null}
    </span>
  );
});

export interface FormDateInputProps extends Omit<FormInputProps, "type"> {
  type?: "date" | "datetime-local" | "month" | "time";
}

export const FormDateInput = forwardRef<HTMLInputElement, FormDateInputProps>(function FormDateInput({ type = "date", ...props }, ref) {
  return <FormInput {...props} ref={ref} type={type} />;
});

export interface FormSelectOption {
  value: string | number;
  label: ReactNode;
  disabled?: boolean;
}

export interface FormSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  value: string | number;
  options: FormSelectOption[];
  onValueChange(value: string): void;
  variant?: InputVariant;
  clearable?: boolean;
  emptyOption?: FormSelectOption;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { className, clearable = true, disabled, emptyOption, onValueChange, options, value, variant = "default", ...props },
  ref
) {
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const mergedOptions = useMemo(() => (emptyOption ? [emptyOption, ...options] : options), [emptyOption, options]);
  const hasValue = String(value ?? "").length > 0;

  function setRefs(element: HTMLSelectElement | null) {
    selectRef.current = element;
    if (typeof ref === "function") {
      ref(element);
    } else if (ref) {
      ref.current = element;
    }
  }

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onValueChange(event.target.value);
  }

  function handleClear() {
    onValueChange("");
    selectRef.current?.focus();
  }

  return (
    <span className={buildClassName("ui-form-control ui-form-control--select", `ui-form-control--${variant}`, disabled ? "is-disabled" : "", clearable ? "is-clearable" : "")}>
      <select {...props} ref={setRefs} className={buildClassName("ui-form-control__native", className)} value={value} disabled={disabled} onChange={handleChange}>
        {mergedOptions.map((option) => (
          <option key={String(option.value)} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {clearable && hasValue && !disabled ? <ControlClearButton onClear={handleClear} /> : null}
      <span className="ui-form-control__chevron" aria-hidden="true">⌄</span>
    </span>
  );
});

export interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function UiButton({ className, variant = "neutral", ...props }: UiButtonProps) {
  const variantClass = variant === "neutral" ? "" : `ui-button--${variant}`;
  return <button {...props} className={buildClassName("ui-button", variantClass, className)} />;
}

function ControlClearButton({ onClear }: { onClear(): void }) {
  return (
    <button type="button" className="ui-form-control__clear" aria-label="清空" onClick={onClear}>
      ×
    </button>
  );
}

function buildClassName(...items: Array<string | undefined | false>) {
  return items.filter(Boolean).join(" ");
}
