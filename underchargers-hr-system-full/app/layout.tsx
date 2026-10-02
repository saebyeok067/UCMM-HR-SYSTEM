import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Underchargers HR System",
  description: "Underchargers HR Management System"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
