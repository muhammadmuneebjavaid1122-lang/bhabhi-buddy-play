import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { GamePortal } from "@/components/game/GamePortal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bhabhi Card Game — Play Thulla / Getaway Online" },
      { name: "description", content: "Play Bhabhi (Thulla, Getaway) online against three AI opponents. Follow suit, dodge the Thulla, and get away before you become the Bhabhi." },
      { property: "og:title", content: "Bhabhi Card Game — Play Thulla / Getaway Online" },
      { property: "og:description", content: "Play Bhabhi (Thulla, Getaway) against three AI bots with full rules, sounds and quick-play mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="min-h-screen bg-background" aria-hidden />}>
      <GamePortal />
    </ClientOnly>
  );
}
