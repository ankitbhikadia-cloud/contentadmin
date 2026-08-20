import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContentAdmin",
  description: "Organize YouTube Shorts uploads and scheduling across channels.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
