import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-surface disabled:opacity-50";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink px-5 text-sm font-semibold text-ink disabled:opacity-50";
export const btnQuiet =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-full bg-bg px-4 text-[13px] font-semibold text-ink hover:bg-line disabled:opacity-50";
export const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-ink";

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-4">
      <div className="min-w-0 flex-[1_1_280px]">
        {sub && <p className="text-[13px] text-muted">{sub}</p>}
        <h1 className="mt-1 text-[28px] font-bold tracking-tight">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function Card({ title, aside, children, className = "" }: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-surface py-2 ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Row({ children, href }: { children: ReactNode; href?: string }) {
  const cls = "flex items-center gap-3.5 border-t border-line-soft px-5 py-3.5";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-bg/60`}>{children}</Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-t border-line-soft px-5 py-6 text-sm text-muted">{children}</p>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "info" | "ok"; children: ReactNode }) {
  const tones = {
    neutral: "bg-line-soft text-ink",
    accent: "bg-accent-soft text-accent-ink",
    info: "bg-info-soft text-info-ink",
    ok: "bg-[#E6F4EC] text-[#1E7B4D]",
  };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
      {label}
      {children}
      {hint && <span className="text-xs font-normal">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={`${inputClass} py-2.5 ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{message}</p>;
}
