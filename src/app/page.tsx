"use client";

import dynamic from "next/dynamic";

const PuzzleScene = dynamic(
  () => import("@/components/puzzle-scene").then((module) => module.PuzzleScene),
  {
    ssr: false,
    loading: () => <div className="scene-loading" aria-label="Loading puzzle board" />,
  },
);

export default function Home() {
  return (
    <main className="game-shell">
      <div className="scene-frame">
        <PuzzleScene />
      </div>
      <header className="game-mark" aria-label="3D Puzzler">
        <span className="game-mark__dot" />
        <span>3D Puzzler</span>
      </header>
    </main>
  );
}
