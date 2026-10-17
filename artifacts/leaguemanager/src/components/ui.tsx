import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function SectionTitle({
  eyebrow,
  title,
  note,
  right,
}: {
  eyebrow?: string;
  title: string;
  note?: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? (
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
        {note ? <p className="mt-1 max-w-[62ch] text-sm text-[var(--muted)]">{note}</p> : null}
      </div>
      {right}
    </header>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        className="input num"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="field">
      {label}
      <select className="input" value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  hint,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</span>
        <span className="num text-sm font-semibold">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
      {hint ? <span className="text-[11px] text-[var(--muted)]">{hint}</span> : null}
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-[var(--lime)]"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-[11px] text-[var(--muted)]">{hint}</span> : null}
      </span>
    </label>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  active?: boolean;
};

export function Btn({ variant = "ghost", active, className = "", ...props }: BtnProps) {
  const custom = active ? "btn-primary" : `btn-${variant}`;
  return <button {...props} className={`btn ${custom} ${className}`} />;
}

export function Chip({ label, value }: { label?: string; value: ReactNode }) {
  return (
    <span className="chip">
      {label ? <b>{label}</b> : null}
      {value}
    </span>
  );
}

export function FormBadge({ result }: { result: "V" | "N" | "D" }) {
  const background = result === "V" ? "rgba(200,255,61,.18)" : result === "N" ? "rgba(255,255,255,.1)" : "rgba(230,57,70,.18)";
  const color = result === "V" ? "var(--lime)" : result === "N" ? "var(--muted)" : "#ff9aa2";
  return (
    <span className="form-badge" style={{ background, color }}>
      {result}
    </span>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] p-8 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[46ch] text-[13px] text-[var(--muted)]">{text}</p>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error"; children: ReactNode }) {
  const style =
    tone === "error"
      ? { borderColor: "rgba(230,57,70,.4)", color: "#ffd9dc", background: "rgba(230,57,70,.07)" }
      : { borderColor: "var(--line)", color: "var(--muted)", background: "rgba(255,255,255,.03)" };
  return (
    <div className="rounded-xl border px-4 py-3 text-[13px]" style={style}>
      {children}
    </div>
  );
}
