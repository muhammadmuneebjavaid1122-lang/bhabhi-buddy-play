import { cn } from "@/lib/utils";
import { isRed, rankLabel, type Card } from "@/lib/bhabhi/cards";

interface Props {
  card?: Card;
  faceDown?: boolean;
  size?: "sm" | "md" | "table" | "lg";
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
}

const sizes = {
  sm: "h-[5.25rem] w-[3.75rem] rounded-md text-xs",
  md: "h-32 w-[5.5rem] rounded-lg text-lg",
  table: "h-32 w-[5.5rem] rounded-lg text-lg sm:h-40 sm:w-28 sm:rounded-xl sm:text-xl",
  lg: "h-44 w-32 rounded-xl text-xl",
};

export function PlayingCard({ card, faceDown, size = "md", className, style, onClick, disabled, highlight }: Props) {
  const base = cn(
    "relative select-none border shadow-[0_8px_18px_var(--playing-card-shadow)] transition-all duration-200",
    sizes[size],
    className,
  );

  if (faceDown || !card) {
    return (
      <div
        style={style}
        className={cn(base, "overflow-hidden border-card-back-border bg-card-back p-1")}
        aria-hidden
      >
        <div className="absolute inset-1 rounded-[inherit] border border-card-face/45" />
        <div className="absolute inset-2 rounded-[inherit] border border-gold/55 bg-[repeating-linear-gradient(45deg,transparent_0_5px,var(--card-back-detail)_5px_7px),repeating-linear-gradient(-45deg,transparent_0_5px,var(--card-back-detail)_5px_7px)]" />
        <div className="absolute inset-[28%] rotate-45 rounded-sm border border-gold/70 bg-card-back-border/50" />
      </div>
    );
  }

  const red = isRed(card.suit);
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={disabled}
      style={style}
      aria-label={`${rankLabel(card.rank)} of ${card.suit}`}
      className={cn(
        base,
        "flex flex-col justify-between overflow-hidden border-card-face-border bg-card-face p-1.5 font-display",
        red ? "text-card-red" : "text-card-black",
        onClick && !disabled && "cursor-pointer hover:-translate-y-4 hover:shadow-[0_16px_28px_var(--playing-card-shadow)]",
        highlight && "ring-2 ring-gold shadow-[0_0_18px_oklch(0.85_0.15_85/0.6)]",
        disabled && onClick && "cursor-not-allowed",
      )}
    >
      <div className="absolute inset-[3px] rounded-[inherit] border border-card-face-border/70" />
      <div className="relative z-10 flex flex-col items-center self-start leading-[0.85]">
        <span className="font-bold">{rankLabel(card.rank)}</span>
        <span className="mt-0.5 text-[0.8em]">{card.suit}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("drop-shadow-sm", size === "lg" || size === "table" ? "text-6xl" : size === "md" ? "text-5xl" : "text-3xl")}>{card.suit}</span>
      </div>
      <div className="relative z-10 flex rotate-180 flex-col items-center self-end leading-[0.85]">
        <span className="font-bold">{rankLabel(card.rank)}</span>
        <span className="mt-0.5 text-[0.8em]">{card.suit}</span>
      </div>
    </Comp>
  );
}
