import { getChannels, getShorts } from "@/lib/data";
import CalendarClient from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [channels, shorts] = await Promise.all([getChannels(), getShorts()]);
  return <CalendarClient shorts={shorts} channels={channels} />;
}
