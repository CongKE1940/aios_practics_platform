import { Children, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

interface BaseFilterFieldProps {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  fieldStyle?: CSSProperties;
}

export interface ClearableFilterInputProps
  extends BaseFilterFieldProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "disabled"> {
  onChange(value: string): void;
}

export function ClearableFilterInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
  fieldStyle,
  onClick,
  ...inputProps
}: ClearableFilterInputProps) {
  const inputType = typeof inputProps.type === "string" ? inputProps.type : "";
  const isDateLike = ["date", "datetime-local", "time", "month", "week"].includes(inputType);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="ui-admin-form__field" style={fieldStyle}>
      <label htmlFor={id}>{label}</label>
      <div
        className={[
          "ui-filter-control",
          "ui-filter-control--input",
          isDateLike ? "ui-filter-control--date" : "",
          value.length > 0 ? "ui-filter-control--has-value" : "",
          value.length === 0 ? "ui-filter-control--empty" : ""
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          ref={inputRef}
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            onClick?.(event);
            if (isDateLike && !disabled) {
              inputRef.current?.showPicker?.();
            }
          }}
          disabled={disabled}
          {...inputProps}
          placeholder=""
        />
        {value.length > 0 ? (
          <button type="button" className="ui-filter-control__clear" onClick={() => onChange("")} disabled={disabled} aria-label={`清除${label}`}>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export interface ClearableFilterSelectProps
  extends BaseFilterFieldProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "value" | "onChange" | "disabled"> {
  placeholder: string;
  children: ReactNode;
  onChange(value: string): void;
}

export function ClearableFilterSelect({
  id,
  label,
  value,
  onChange,
  children,
  disabled = false,
  fieldStyle,
  placeholder: _placeholder,
  ...selectProps
}: ClearableFilterSelectProps) {
  void _placeholder;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(() => collectSelectOptions(children), [children]);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="ui-admin-form__field" style={fieldStyle}>
      <label htmlFor={id}>{label}</label>
      <div
        ref={rootRef}
        className={["ui-filter-control", "ui-filter-control--select", value.length > 0 ? "ui-filter-control--has-value" : "", open ? "is-open" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <select
          id={id}
          className="ui-filter-select__native"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          {...selectProps}
        >
          {children}
        </select>
        <button
          type="button"
          className="ui-filter-select__button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <span>{selectedOption?.label ?? "\u00A0"}</span>
        </button>
        {value.length > 0 ? (
          <button
            type="button"
            className="ui-filter-control__clear"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            disabled={disabled}
            aria-label={`清除${label}`}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {open ? (
          <div className="ui-filter-select__menu" role="listbox" aria-label={label}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={["ui-filter-select__option", option.value === value ? "is-selected" : ""].filter(Boolean).join(" ")}
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function collectSelectOptions(children: ReactNode): Array<{ value: string; label: string; disabled: boolean }> {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
      return {
        value: props.value === undefined ? "" : String(props.value),
        label: optionLabel(props.children),
        disabled: Boolean(props.disabled)
      };
    })
    .filter((option) => option.value.length > 0);
}

function optionLabel(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return Children.toArray(value).join("");
}
