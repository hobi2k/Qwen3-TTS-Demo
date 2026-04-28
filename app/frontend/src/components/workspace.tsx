"use client";

import { ReactNode } from "react";
import { Loader2, LucideIcon, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  eyebrow: string;
  eyebrowIcon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    formId?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    icon?: LucideIcon;
    variant?: "default" | "secondary" | "outline";
  };
  meta?: ReactNode;
}

export function WorkspaceHeader({
  eyebrow,
  eyebrowIcon: EyebrowIcon = Sparkles,
  title,
  subtitle,
  action,
  meta,
}: WorkspaceHeaderProps) {
  const ActionIcon = action?.icon ?? Play;
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/80 pb-6">
      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase text-ink-muted tracking-allcaps">
          <EyebrowIcon className="size-3" />
          {eyebrow}
        </span>
        <h1 className="text-display font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="max-w-prose text-base text-ink-muted">{subtitle}</p> : null}
        {meta}
      </div>
      {action ? (
        <Button
          type={action.formId ? "submit" : "button"}
          form={action.formId}
          onClick={action.onClick}
          disabled={action.disabled || action.loading}
          variant={action.variant ?? "default"}
          size="lg"
          className="gap-2 px-6"
        >
          {action.loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ActionIcon className="size-4" />
          )}
          {action.label}
        </Button>
      ) : null}
    </header>
  );
}

export function WorkspaceShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "mx-auto flex w-full max-w-[var(--shell-content-max)] flex-col gap-6 px-1",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function WorkspaceCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface p-5 shadow-[0_1px_0_0_var(--line-subtle)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-sunken/40 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-line bg-surface">
        <Icon className="size-5 text-ink-subtle" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {body ? <p className="max-w-sm text-xs text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function WorkspaceResultHeader({
  title,
  badge,
  trailing,
}: {
  title: string;
  badge?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {badge ? (
          <Badge
            variant="secondary"
            className="border-0 bg-accent-soft text-accent-ink font-mono text-[10px] uppercase tracking-allcaps"
          >
            {badge}
          </Badge>
        ) : null}
        <h3 className="text-sm font-medium text-ink">{title}</h3>
      </div>
      {trailing}
    </div>
  );
}

export function WorkspaceFieldLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-medium uppercase tracking-allcaps text-ink-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}
