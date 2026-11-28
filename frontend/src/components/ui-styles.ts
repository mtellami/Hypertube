// Shared Tailwind styles keep repeated controls consistent across pages.
const buttonVariants = {
  primary:
    "bg-transparent bg-(image:--accent-grad) text-white shadow-(--shadow-glow) enabled:hover:shadow-[0_14px_44px_-10px_rgba(var(--accent-rgb),0.75)] enabled:hover:[transform:translateY(-1px)]",
  ghost:
    "bg-transparent text-secondary hover:bg-white/6 hover:text-foreground [&.active]:bg-white/6 [&.active]:text-foreground",
  glass:
    "bg-white/8 border-outline-strong backdrop-blur-[12px] text-foreground hover:bg-white/14",
  oauth:
    "bg-surface-raised border-outline-strong text-foreground hover:bg-surface-high hover:border-white/22 [&.dc_svg]:text-[#8c9eff] [&.gl_svg]:text-[#fc8d4e]",
};

const buttonSizes = {
  default: "h-10.5 px-4.5 text-[0.92rem]",
  lg: "h-12.5 px-6.5 text-[1rem]",
  small: "h-8.5 px-3.5 text-[0.84rem]",
  oauth: "h-11.5 px-4.5 text-[0.92rem]",
};

export function buttonStyles({
  variant = "primary",
  size = "default",
  fullWidth = false,
}: {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  fullWidth?: boolean;
} = {}) {
  return [
    "btn inline-flex items-center justify-center gap-2 py-0 border font-semibold whitespace-nowrap transition-[transform,translate,background,box-shadow,border-color,opacity] duration-200 ease-(--ease) enabled:active:scale-[0.97] disabled:opacity-55 disabled:cursor-not-allowed",
    variant === "oauth" ? "rounded-xl" : "rounded-[999px]",
    variant === "glass" || variant === "oauth" ? "" : "border-transparent",
    buttonSizes[variant === "oauth" ? "oauth" : size],
    buttonVariants[variant],
    fullWidth ? "w-full" : "",
  ].join(" ");
}

export function iconButtonStyles({
  ghost = false,
  small = false,
  quality = false,
}: { ghost?: boolean; small?: boolean; quality?: boolean } = {}) {
  return [
    "icon-btn place-items-center border text-secondary transition-[background,color,transform] duration-200 hover:text-foreground [&.active]:text-highlight",
    quality
      ? "inline-flex w-auto h-10 px-2 py-0 gap-1 rounded-[999px]"
      : "inline-grid rounded-[50%]",
    quality ? "" : small ? "size-7" : "size-10",
    ghost
      ? "bg-transparent border-transparent hover:bg-white/10"
      : "border-outline bg-surface-raised hover:bg-surface-high",
  ].join(" ");
}

const controlFocus =
  "focus:border-[rgba(var(--accent-2-rgb),0.7)] focus:shadow-[0_0_0_4px_rgba(var(--accent-rgb),0.14)]";
const controlBase = `w-full rounded-xl bg-surface border border-outline-strong outline-none transition-[border-color,box-shadow,background] duration-200 ${controlFocus}`;

export const fieldLabelStyles = "text-[0.84rem] font-medium text-secondary";
export const inputStyles = `${controlBase} h-11.5 px-3.5 py-0 aria-invalid:border-danger/70`;
export const textAreaStyles = `${controlBase} h-auto px-3.5 py-3 resize-y leading-normal min-h-20`;

const filterBase = `bg-surface-raised border border-outline-strong rounded-[10px] h-10 px-3 py-0 outline-none text-foreground text-[0.88rem] ${controlFocus}`;
export const filterSelectStyles = `${filterBase} min-w-37.5 tablet:w-full tablet:min-w-0`;
export const filterYearStyles = `${filterBase} w-27.5 tablet:w-full tablet:min-w-0`;

export const alertStyles = {
  error: "bg-danger/10 border-danger/35 text-[#ffb4c2]",
  success: "bg-success/10 border-success/35 text-[#9ff0cb]",
  info: "bg-[#5aa9ff]/10 border-[#5aa9ff]/35 text-[#b8dbff] mb-5",
};
