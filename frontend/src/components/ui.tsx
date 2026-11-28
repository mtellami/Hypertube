import { alertStyles, inputStyles, fieldLabelStyles } from "./ui-styles";
import {
  useId,
  useState,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export function Spinner({ size = 22 }: { size?: number }) {
  return (
    <span
      className="spinner border-[2.5px] border-solid border-white/15 border-t-highlight animate-[spin_0.8s_linear_infinite] inline-block rounded-full"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="min-h-[70vh] grid place-items-center">
      <Spinner size={36} />
    </div>
  );
}

export function initials(first?: string, last?: string, fallback = "?") {
  const s =
    `${(first || "").trim()[0] || ""}${(last || "").trim()[0] || ""}`.toUpperCase();
  return s || fallback.slice(0, 2).toUpperCase();
}

export function Avatar({
  url,
  name,
  size = 40,
  first,
  last,
}: {
  url: string | null | undefined;
  name: string;
  size?: number;
  first?: string;
  last?: string;
}) {
  const [broken, setBroken] = useState(false);
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (url && !broken) {
    return (
      <img
        className="avatar rounded-full object-cover shrink-0 bg-surface-high"
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="avatar rounded-full object-cover shrink-0 bg-surface-high inline-grid place-items-center font-bold text-white font-heading tracking-[0.02em]"
      aria-label={name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 60% 28%))`,
      }}
    >
      {initials(first, last, name)}
    </span>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, id, className, ...rest }: FieldProps,
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div
      className={`grid gap-1.5 min-w-0 ${error ? "has-error" : ""} ${className ?? ""}`}
    >
      <label className={fieldLabelStyles} htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        className={inputStyles}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        {...rest}
      />
      {(error || hint) && (
        <p
          id={`${inputId}-msg`}
          className={
            error ? "text-danger text-[0.8rem]" : "text-muted text-[0.8rem]"
          }
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

export function SelectField({
  label,
  value,
  onChange,
  children,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <div className={`grid gap-1.5 min-w-0`}>
      <label className={fieldLabelStyles} htmlFor={selectId}>
        {label}
      </label>
      <select
        className={inputStyles}
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "success" | "info";
  children: ReactNode;
}) {
  return (
    <div
      className={`alert border border-solid rounded-xl text-[0.9rem] py-3 px-4 ${alertStyles[kind]}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state [&_p]:text-muted [&_p]:max-w-95 [&_.btn]:mt-2.5 text-center grid justify-items-center gap-2.5 py-15 px-5">
      {icon && (
        <div className="empty-icon [background:var(--accent-soft)] w-16 h-16 rounded-[20px] grid place-items-center text-highlight mb-1.5">
          {icon}
        </div>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
