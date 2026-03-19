import { useEffect, useMemo, useState } from "react";
import { citiesForCountry, FORM_COUNTRIES } from "@/data/formLocations";

const FIELD_SELECT_CLASS =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

const CITY_OTHER = "__other__";

export function FormCountrySelect({
  value,
  onChange,
  disabled,
  required,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const inList = FORM_COUNTRIES.includes(value);
  return (
    <select
      value={inList ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      required={required && !disabled}
      className={`${FIELD_SELECT_CLASS}${disabled ? " disabled:bg-surface-subtle" : ""}`}
    >
      <option value="">{required ? "Select country **" : "Select country"}</option>
      {!inList && value.trim() ? (
        <option value={value}>{value}</option>
      ) : null}
      {FORM_COUNTRIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

export function FormCitySelect({
  country,
  value,
  onChange,
  disabled,
  required,
}: {
  country: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const options = useMemo(() => citiesForCountry(country), [country]);
  const [otherActive, setOtherActive] = useState(false);

  useEffect(() => {
    setOtherActive(false);
  }, [country]);

  useEffect(() => {
    if (!options.length) return;
    if (value && !options.includes(value)) {
      setOtherActive(true);
    }
  }, [options, value]);

  const inList = options.includes(value);
  const selectValue = inList ? value : otherActive || (value && !inList) ? CITY_OTHER : "";

  if (options.length === 0) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required && !disabled}
        placeholder="City name"
        className={`${FIELD_SELECT_CLASS}${disabled ? " disabled:bg-surface-subtle" : ""}`}
      />
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === CITY_OTHER) {
            setOtherActive(true);
            onChange("");
          } else {
            setOtherActive(false);
            onChange(v);
          }
        }}
        disabled={disabled}
        required={required && !disabled && !otherActive}
        className={`${FIELD_SELECT_CLASS}${disabled ? " disabled:bg-surface-subtle" : ""}`}
      >
        <option value="">{required ? "Select city **" : "Select city"}</option>
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={CITY_OTHER}>Other…</option>
      </select>
      {otherActive ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required && !disabled}
          placeholder="Enter city name"
          className={`${FIELD_SELECT_CLASS}${disabled ? " disabled:bg-surface-subtle" : ""}`}
        />
      ) : null}
    </div>
  );
}
