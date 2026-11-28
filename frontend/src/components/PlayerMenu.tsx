import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactElement } from "react";
import { LuCheck } from "react-icons/lu";

interface Props {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
  children: ReactElement;
}

export default function PlayerMenu({
  label,
  value,
  options,
  onValueChange,
  open,
  onOpenChange,
  container,
  children,
}: Props) {
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={8}
          aria-label={label}
          className="sub-menu z-60 min-w-47.5 rounded-xl border border-outline-strong bg-surface/96 p-2 text-foreground backdrop-blur-[12px] shadow-(--shadow) animate-[pop_0.15s_var(--ease)]"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-[0.72rem] uppercase tracking-[0.1em] text-muted">
            {label}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={onValueChange}>
            {options.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-[9px] pr-2.5 pl-8.5 text-[0.88rem] outline-none data-[highlighted]:bg-white/8"
              >
                <DropdownMenu.ItemIndicator className="absolute left-2.5 text-highlight">
                  <LuCheck size={16} />
                </DropdownMenu.ItemIndicator>
                {option.label}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
