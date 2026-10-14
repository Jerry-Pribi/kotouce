import { useState } from "react";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
};

export function PasswordField({ id, label, value, onChange, autoComplete, minLength, required = false }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="filter-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
        <button className="password-visibility-toggle" type="button" aria-label={visible ? "Skrýt heslo" : "Zobrazit heslo"} aria-pressed={visible} onClick={() => setVisible((current) => !current)}>
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.8 4.6 9.5 6-.3.7-1.3 2-2.8 3.2M6.2 6.2C4.1 7.5 2.8 9.5 2.5 11c.7 1.4 4.3 6 9.5 6 1 0 2-.2 2.9-.5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
