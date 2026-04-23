import { ButtonHTMLAttributes, ReactNode } from "react";

// ═══ Button ═══
type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  full?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-gold-400 text-blue-800 hover:bg-gold-300 shadow-lg shadow-gold-400/25 hover:shadow-gold-400/40 hover:-translate-y-0.5",
  secondary:
    "bg-blue-500 text-white hover:bg-blue-400 shadow-lg shadow-blue-500/25",
  outline:
    "bg-transparent text-blue-500 border-2 border-blue-500 hover:bg-blue-500 hover:text-white",
  ghost:
    "bg-transparent text-blue-500 hover:bg-blue-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-6 py-3 text-sm rounded-xl",
  lg: "px-10 py-4 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        font-body font-semibold transition-all duration-300 cursor-pointer
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${full ? "w-full" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}

// ═══ Badge ═══
type BadgeColor = "blue" | "green" | "red" | "orange" | "gold" | "gray" | "purple" | "yellow";

const badgeColors: Record<BadgeColor, string> = {
  blue: "text-blue-500 bg-blue-50",
  green: "text-green-700 bg-green-50",
  red: "text-red-600 bg-red-50",
  orange: "text-orange-600 bg-orange-50",
  gold: "text-gold-600 bg-gold-50",
  gray: "text-gray-500 bg-gray-100",
  purple: "text-purple-600 bg-purple-50",
  yellow: "text-yellow-800 bg-yellow-100",
};

interface BadgeProps {
  color?: BadgeColor;
  children: ReactNode;
  className?: string;
}

export function Badge({ color = "blue", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full
        text-xs font-semibold font-body whitespace-nowrap
        ${badgeColors[color]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

// ═══ Card ═══
interface CardProps {
  children: ReactNode;
  hover?: boolean;
  className?: string;
  padding?: "sm" | "md" | "lg";
  onClick?: () => void;
}

const paddingStyles = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  children,
  hover = false,
  className = "",
  padding = "md",
  onClick,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        card ${paddingStyles[padding]}
        ${hover ? "card-hover cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

// ═══ Section Header ═══
interface SectionHeaderProps {
  tag?: string;
  title: string;
  subtitle?: string;
  light?: boolean;
  className?: string;
}

export function SectionHeader({
  tag,
  title,
  subtitle,
  light = false,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`text-center mb-14 ${className}`}>
      {tag && (
        <span className="block text-xs font-bold font-body text-gold-400 uppercase tracking-widest mb-3">
          {tag}
        </span>
      )}
      <h2
        className={`
          font-display text-3xl md:text-4xl font-bold leading-tight tracking-tight mb-4
          ${light ? "text-white" : "text-blue-800"}
        `}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={`
            font-body text-lg leading-relaxed max-w-xl mx-auto
            ${light ? "text-white/60" : "text-gray-500"}
          `}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
