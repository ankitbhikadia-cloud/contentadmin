import { getChannels, getDashboardCounts } from "@/lib/data";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [channels, counts] = await Promise.all([
    getChannels(),
    getDashboardCounts(),
  ]);

  return (
    <div className="app-shell">
      <Sidebar channels={channels} needsReviewCount={counts.needsReview} />
      <main className="main">{children}</main>
    </div>
  );
}
