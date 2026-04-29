import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  const { placeholder: _placeholder, ...nativeProps } = props;
  const hasValue = String(value ?? "").length > 0;
  const inputClassName = buildClassName("ui-form-control__native", className);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value);
  }

  return (
    <span className={buildClassName("ui-form-control", `ui-form-control--${variant}`, disabled ? "is-disabled" : "", clearable ? "is-clearable" : "")}>
      <input {...nativeProps} ref={ref} className={inputClassName} type={type} value={value} disabled={disabled} placeholder="" onChange={handleChange} />
      {clearable && hasValue && !disabled ? <ControlClearButton onClear={() => onValueChange("")} /> : null}
    </span>
  );
});

export interface FormDateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  value: string;
  onValueChange(value: string): void;
  variant?: InputVariant;
  clearable?: boolean;
}

export const FormDateInput = forwardRef<HTMLInputElement, FormDateInputProps>(function FormDateInput(
  { className, clearable = true, disabled, onValueChange, value, variant = "default", ...props },
  ref
) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseISODate(value);
  const [viewDate, setViewDate] = useState<Date>(() => selectedDate ?? new Date());
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const days = useMemo(() => getCalendarDays(viewDate), [viewDate]);
  const title = `${viewDate.getFullYear()}年${viewDate.getMonth() + 1}月`;

  useEffect(() => {
    const nextDate = parseISODate(value);
    if (nextDate) {
      setViewDate(nextDate);
    }
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value);
  }

  function handleSelectDate(date: Date) {
    onValueChange(formatISODate(date));
    setViewDate(date);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleClear() {
    onValueChange("");
    buttonRef.current?.focus();
  }

  return (
    <span ref={rootRef} className={buildClassName("ui-form-control ui-form-control--date", `ui-form-control--${variant}`, disabled ? "is-disabled" : "", clearable ? "is-clearable" : "")}>
      <input {...props} ref={ref} className={buildClassName("ui-form-control__native-date", className)} type="date" value={value} disabled={disabled} placeholder="" onChange={handleInputChange} />
      <button ref={buttonRef} type="button" className="ui-form-control__trigger" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {value}
      </button>
      {clearable && value && !disabled ? <ControlClearButton onClear={handleClear} /> : null}
      <span className="ui-form-control__calendar-icon" aria-hidden="true">日</span>
      {open && !disabled ? (
        <div className="ui-form-popover ui-form-calendar" role="dialog" aria-label="日期选择器">
          <div className="ui-form-calendar__header">
            <button type="button" onClick={() => setViewDate(addMonths(viewDate, -1))}>‹</button>
            <strong>{title}</strong>
            <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))}>›</button>
          </div>
          <div className="ui-form-calendar__weekdays" aria-hidden="true">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="ui-form-calendar__grid">
            {days.map((day) => (
              <button
                key={day.key}
                type="button"
                className={buildClassName(
                  "ui-form-calendar__day",
                  day.inMonth ? "" : "is-muted",
                  selectedDate && isSameDay(day.date, selectedDate) ? "is-selected" : ""
                )}
                onClick={() => handleSelectDate(day.date)}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </span>
  );
});

export interface FormSelectOption {
  value: string | number;
  label: ReactNode;
  disabled?: boolean;
}

export interface FormSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "children"> {
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
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const mergedOptions = useMemo(() => (emptyOption ? [emptyOption, ...options] : options), [emptyOption, options]);
  const selectedOption = mergedOptions.find((option) => String(option.value) === String(value));
  const hasValue = String(value ?? "").length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

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
    setOpen(false);
    buttonRef.current?.focus();
  }

  function handleSelect(nextValue: string | number) {
    onValueChange(String(nextValue));
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <span ref={rootRef} className={buildClassName("ui-form-control ui-form-control--select", `ui-form-control--${variant}`, disabled ? "is-disabled" : "", clearable ? "is-clearable" : "")}>
      <select {...props} ref={setRefs} className={buildClassName("ui-form-control__native-select", className)} value={value} disabled={disabled} onChange={handleChange} tabIndex={-1} aria-hidden="true">
        {mergedOptions.map((option) => (
          <option key={String(option.value)} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        ref={buttonRef}
        type="button"
        className="ui-form-control__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {hasValue ? selectedOption?.label : null}
      </button>
      {clearable && hasValue && !disabled ? <ControlClearButton onClear={handleClear} /> : null}
      <span className="ui-form-control__chevron" aria-hidden="true">⌄</span>
      {open && !disabled ? (
        <div className="ui-form-popover ui-form-select-list" role="listbox">
          {mergedOptions.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={buildClassName("ui-form-select-list__option", String(option.value) === String(value) ? "is-selected" : "")}
              disabled={option.disabled}
              onClick={() => handleSelect(option.value)}
            >
              {String(option.value).length > 0 ? option.label : null}
            </button>
          ))}
        </div>
      ) : null}
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
    <button type="button" className="ui-form-control__clear" aria-label="清空" onClick={onClear} onMouseDown={(event) => event.preventDefault()}>
      ×
    </button>
  );
}

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function getCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, inMonth: date.getMonth() === month, key: formatISODate(date) };
  });
}

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function buildClassName(...items: Array<string | undefined | false>) {
  return items.filter(Boolean).join(" ");
}
