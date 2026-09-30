import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import TabArena from "@/components/TabArena";

export const metadata: Metadata = {
  title: "Tab Arena — Airen",
  description:
    "Play the daily tab challenge: tap through the level ladder within 24 hours to raise your staking APY by up to 1.50%, scaled by the power of the veSneaker you bring.",
};

export default function PlayPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6">
        <TabArena />
      </main>
    </div>
  );
}
