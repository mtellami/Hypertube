import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

export function Spinner({ size = 22 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="page-center">
      <Spinner size={36} />
    </div>
  );
}

export function initials(first?: string, last?: string, fallback = "?") {
  const s = `${(first || "").trim()[0] || ""}${(last || "").trim()[0] || ""}`.toUpperCase();
  return s || fallback.slice(0, 2).toUpperCase();
}

export function Avatar({ url, name, size = 40, first, last }: {
  url: string | null | undefined; name: string; size?: number; first?: string; last?: string;
}) {
  const [broken, setBroken] = useState(false);
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (url && !broken) {
    return (
      <img className="avatar" src={url} alt={name} width={size} height={size} style={{ width: size, height: size }}
        referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    );
  }
  return (
    <span className="avatar avatar-fallback" aria-label={name}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 28%))` }}>
      {initials(first, last, name)}
    </span>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, id, className, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={`field ${error ? "has-error" : ""} ${className ?? ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-invalid={!!error} aria-describedby={error || hint ? `${inputId}-msg` : undefined} {...rest} />
      {(error || hint) && (
        <p id={`${inputId}-msg`} className={error ? "field-error" : "field-hint"}>{error || hint}</p>
      )}
    </div>
  );
}

export function SelectField({ label, value, onChange, children, id }: {
  label: string; value: string; onChange: (v: string) => void; children: ReactNode; id?: string;
}) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={selectId}>{label}</label>
      <select id={selectId} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
