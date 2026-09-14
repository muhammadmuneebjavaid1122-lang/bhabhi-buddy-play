import { cn } from "@/lib/utils";
import { isRed, rankLabel, type Card } from "@/lib/bhabhi/cards";

interface Props {
  card?: Card;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
}

const sizes = {
  sm: "h-14 w-10 rounded-md text-[10px]",
  md: "h-24 w-16 rounded-lg text-sm",
  lg: "h-32 w-[5.5rem] rounded-xl text-base",
};

export function PlayingCard({ card, faceDown, size = "md", className, style, onClick, disabled, highlight }: Props) {
  const base = cn(
    "relative select-none shadow-md shadow-black/40 border transition-all duration-200",
    sizes[size],
    className,
  );

  if (faceDown || !card) {
    return (
      <div
        style={style}
        className={cn(base, "border-card-back-border bg-card-back overflow-hidden")}
        aria-hidden
      >
        <div className="absolute inset-[3px] rounded-[inherit] border border-gold/40 bg-[repeating-linear-gradient(45deg,transparent_0_4px,oklch(1_0_0/6%)_4px_5px)]" />
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
        "bg-card-face border-card-face-border flex flex-col justify-between p-1.5 font-display",
        red ? "text-card-red" : "text-card-black",
        onClick && !disabled && "cursor-pointer hover:-translate-y-3 hover:shadow-xl hover:shadow-black/50",
        highlight && "ring-2 ring-gold shadow-[0_0_18px_oklch(0.85_0.15_85/0.6)]",
        disabled && onClick && "cursor-not-allowed",
      )}
    >
      <div className="flex flex-col items-start leading-none">
        <span className="font-bold">{rankLabel(card.rank)}</span>
        <span className="text-[0.85em]">{card.suit}</span>
      </div>
      <span className={cn("self-center", size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-base")}>
        {card.suit}
      </span>
      <div className="flex rotate-180 flex-col items-start leading-none">
        <span className="font-bold">{rankLabel(card.rank)}</span>
        <span className="text-[0.85em]">{card.suit}</span>
      </div>
    </Comp>
  );
}
