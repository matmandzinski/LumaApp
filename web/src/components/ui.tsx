import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  className?: string;
  as?: "section" | "article" | "div";
}>;

type ButtonVariant = "primary" | "secondary" | "ghost";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

export function Card({ children, className, as = "section" }: CardProps) {
  const Component = as;
  return <Component className={`card ${className ?? ""}`.trim()}>{children}</Component>;
}

export function AppButton({
  children,
  className,
  variant = "primary",
  fullWidth = false,
  ...props
}: AppButtonProps) {
  return (
    <button
      type="button"
      className={`btn ${variant} ${fullWidth ? "full-width" : ""} ${className ?? ""}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <p className="eyebrow">{children}</p>;
}

export function Heading({ children }: PropsWithChildren) {
  return <h2 className="heading">{children}</h2>;
}

export function MetaText({ children }: PropsWithChildren) {
  return <p className="meta-text">{children}</p>;
}

type TopBarProps = {
  onBack?: () => void;
  onProfileOpen: () => void;
  title: string;
};

export function TopBar({ onBack, onProfileOpen, title }: TopBarProps) {
  return (
    <header className="top-bar" aria-label={title}>
      <button
        type="button"
        className="icon-chip"
        aria-label={onBack ? "Back" : "Menu"}
        onClick={onBack}
      >
        {onBack ? <BackIcon /> : <MenuIcon />}
      </button>
      <p className="top-bar-title">{title}</p>
      <button type="button" className="icon-chip" aria-label="Profile" onClick={onProfileOpen}>
        <ProfileIcon />
      </button>
    </header>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.75 19c.8-3.2 3-4.8 6.25-4.8s5.45 1.6 6.25 4.8" />
    </svg>
  );
}
