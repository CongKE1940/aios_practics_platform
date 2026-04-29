type Cleanup = () => void;

declare global {
  interface Window {
    __aiosFormControlEnhancerCleanup?: Cleanup;
  }
}

const enhancedAttribute = "data-aios-enhanced-control";
const ignoredInputTypes = new Set(["button", "checkbox", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

export function installFormControlEnhancer(root: ParentNode = document): Cleanup {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  window.__aiosFormControlEnhancerCleanup?.();

  const cleanups = new Set<Cleanup>();

  function refresh() {
    root.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
      if (input.closest(".ui-form-control") || input.hasAttribute(enhancedAttribute) || ignoredInputTypes.has(input.type)) {
        return;
      }
      if (input.type === "date") {
        cleanups.add(enhanceDateInput(input));
      } else {
        cleanups.add(enhanceTextInput(input));
      }
    });

    root.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
      if (select.closest(".ui-form-control") || select.hasAttribute(enhancedAttribute)) {
        return;
      }
      cleanups.add(enhanceSelect(select));
    });
  }

  const observer = new MutationObserver(() => refresh());
  observer.observe(document.body, { childList: true, subtree: true });
  refresh();

  const cleanup = () => {
    observer.disconnect();
    cleanups.forEach((item) => item());
    cleanups.clear();
    if (window.__aiosFormControlEnhancerCleanup === cleanup) {
      window.__aiosFormControlEnhancerCleanup = undefined;
    }
  };

  window.__aiosFormControlEnhancerCleanup = cleanup;
  return cleanup;
}

function enhanceTextInput(input: HTMLInputElement): Cleanup {
  input.setAttribute(enhancedAttribute, "input");
  input.placeholder = "";
  input.classList.add("ui-enhanced-native");

  const wrapper = document.createElement("span");
  wrapper.className = "ui-form-control ui-form-control--enhanced";
  input.parentNode?.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "ui-form-control__clear";
  clearButton.setAttribute("aria-label", "清空");
  clearButton.textContent = "×";
  wrapper.appendChild(clearButton);

  const update = () => {
    clearButton.hidden = !input.value || input.disabled || input.readOnly;
    wrapper.classList.toggle("is-disabled", input.disabled);
  };
  const clear = () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
    update();
  };

  input.addEventListener("input", update);
  input.addEventListener("change", update);
  clearButton.addEventListener("mousedown", preventDefault);
  clearButton.addEventListener("click", clear);
  update();

  return () => {
    input.removeEventListener("input", update);
    input.removeEventListener("change", update);
    clearButton.removeEventListener("mousedown", preventDefault);
    clearButton.removeEventListener("click", clear);
    input.classList.remove("ui-enhanced-native");
    input.removeAttribute(enhancedAttribute);
    wrapper.parentNode?.insertBefore(input, wrapper);
    wrapper.remove();
  };
}

function enhanceSelect(select: HTMLSelectElement): Cleanup {
  select.setAttribute(enhancedAttribute, "select");
  select.classList.add("ui-enhanced-native-select");
  const firstEmptyOption = select.querySelector<HTMLOptionElement>('option[value=""]');
  if (firstEmptyOption) {
    firstEmptyOption.textContent = "";
  }

  const wrapper = document.createElement("span");
  wrapper.className = "ui-form-control ui-form-control--select ui-form-control--enhanced";
  select.parentNode?.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-form-control__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  wrapper.appendChild(trigger);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "ui-form-control__clear";
  clearButton.setAttribute("aria-label", "清空");
  clearButton.textContent = "×";
  wrapper.appendChild(clearButton);

  const chevron = document.createElement("span");
  chevron.className = "ui-form-control__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "⌄";
  wrapper.appendChild(chevron);

  const list = document.createElement("div");
  list.className = "ui-form-popover ui-form-select-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  wrapper.appendChild(list);

  const close = () => {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    renderOptions();
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  const toggle = () => (list.hidden ? open() : close());
  const update = () => {
    const selectedOption = select.selectedOptions[0];
    const hasValue = Boolean(select.value);
    trigger.textContent = hasValue ? selectedOption?.textContent ?? "" : "";
    trigger.disabled = select.disabled;
    clearButton.hidden = !hasValue || select.disabled;
    wrapper.classList.toggle("is-disabled", select.disabled);
  };
  const renderOptions = () => {
    list.innerHTML = "";
    Array.from(select.options).forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ui-form-select-list__option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.disabled = option.disabled;
      item.textContent = option.value ? option.textContent ?? "" : "";
      if (option.selected) {
        item.classList.add("is-selected");
      }
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        trigger.focus();
        update();
      });
      list.appendChild(item);
    });
  };
  const clear = () => {
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    close();
    trigger.focus();
    update();
  };
  const handleDocumentPointer = (event: MouseEvent) => {
    if (!wrapper.contains(event.target as Node)) {
      close();
    }
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
    }
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      open();
    }
  };

  select.addEventListener("change", update);
  trigger.addEventListener("click", toggle);
  trigger.addEventListener("keydown", handleKeyDown);
  clearButton.addEventListener("mousedown", preventDefault);
  clearButton.addEventListener("click", clear);
  document.addEventListener("mousedown", handleDocumentPointer);
  update();
  renderOptions();

  return () => {
    select.removeEventListener("change", update);
    trigger.removeEventListener("click", toggle);
    trigger.removeEventListener("keydown", handleKeyDown);
    clearButton.removeEventListener("mousedown", preventDefault);
    clearButton.removeEventListener("click", clear);
    document.removeEventListener("mousedown", handleDocumentPointer);
    select.classList.remove("ui-enhanced-native-select");
    select.removeAttribute(enhancedAttribute);
    wrapper.parentNode?.insertBefore(select, wrapper);
    wrapper.remove();
  };
}

function enhanceDateInput(input: HTMLInputElement): Cleanup {
  input.setAttribute(enhancedAttribute, "date");
  input.placeholder = "";
  input.classList.add("ui-enhanced-native-date");

  const wrapper = document.createElement("span");
  wrapper.className = "ui-form-control ui-form-control--date ui-form-control--enhanced";
  input.parentNode?.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-form-control__trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  wrapper.appendChild(trigger);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "ui-form-control__clear";
  clearButton.setAttribute("aria-label", "清空");
  clearButton.textContent = "×";
  wrapper.appendChild(clearButton);

  const calendarIcon = document.createElement("span");
  calendarIcon.className = "ui-form-control__calendar-icon";
  calendarIcon.setAttribute("aria-hidden", "true");
  calendarIcon.textContent = "日";
  wrapper.appendChild(calendarIcon);

  const popover = document.createElement("div");
  popover.className = "ui-form-popover ui-form-calendar";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "日期选择器");
  popover.hidden = true;
  wrapper.appendChild(popover);

  let viewDate = parseISODate(input.value) ?? new Date();

  const close = () => {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    renderCalendar();
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
  };
  const update = () => {
    trigger.textContent = input.value;
    trigger.disabled = input.disabled || input.readOnly;
    clearButton.hidden = !input.value || input.disabled || input.readOnly;
    wrapper.classList.toggle("is-disabled", input.disabled);
    const selected = parseISODate(input.value);
    if (selected) {
      viewDate = selected;
    }
  };
  const setValue = (date: Date | null) => {
    input.value = date ? formatISODate(date) : "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    update();
  };
  const renderCalendar = () => {
    const selected = parseISODate(input.value);
    popover.innerHTML = "";
    const header = document.createElement("div");
    header.className = "ui-form-calendar__header";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "‹";
    const title = document.createElement("strong");
    title.textContent = `${viewDate.getFullYear()}年${viewDate.getMonth() + 1}月`;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "›";
    previous.addEventListener("click", () => {
      viewDate = addMonths(viewDate, -1);
      renderCalendar();
    });
    next.addEventListener("click", () => {
      viewDate = addMonths(viewDate, 1);
      renderCalendar();
    });
    header.append(previous, title, next);
    popover.appendChild(header);

    const weekdays = document.createElement("div");
    weekdays.className = "ui-form-calendar__weekdays";
    ["一", "二", "三", "四", "五", "六", "日"].forEach((day) => {
      const item = document.createElement("span");
      item.textContent = day;
      weekdays.appendChild(item);
    });
    popover.appendChild(weekdays);

    const grid = document.createElement("div");
    grid.className = "ui-form-calendar__grid";
    getCalendarDays(viewDate).forEach((day) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ui-form-calendar__day";
      if (!day.inMonth) {
        item.classList.add("is-muted");
      }
      if (selected && isSameDay(day.date, selected)) {
        item.classList.add("is-selected");
      }
      item.textContent = String(day.date.getDate());
      item.addEventListener("click", () => {
        setValue(day.date);
        close();
        trigger.focus();
      });
      grid.appendChild(item);
    });
    popover.appendChild(grid);
  };
  const handleDocumentPointer = (event: MouseEvent) => {
    if (!wrapper.contains(event.target as Node)) {
      close();
    }
  };

  input.addEventListener("input", update);
  input.addEventListener("change", update);
  trigger.addEventListener("click", () => (popover.hidden ? open() : close()));
  clearButton.addEventListener("mousedown", preventDefault);
  clearButton.addEventListener("click", () => {
    setValue(null);
    close();
    trigger.focus();
  });
  document.addEventListener("mousedown", handleDocumentPointer);
  update();

  return () => {
    input.removeEventListener("input", update);
    input.removeEventListener("change", update);
    clearButton.removeEventListener("mousedown", preventDefault);
    document.removeEventListener("mousedown", handleDocumentPointer);
    input.classList.remove("ui-enhanced-native-date");
    input.removeAttribute(enhancedAttribute);
    wrapper.parentNode?.insertBefore(input, wrapper);
    wrapper.remove();
  };
}

function preventDefault(event: Event) {
  event.preventDefault();
}

function getCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, inMonth: date.getMonth() === month };
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
