import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// The home screens share the builders' look (backdrop, logo, option buttons).
import "../(vanes-nozzles)/globals.css";
import "./home.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "APG Report Center",
  description: "Allied Power Group report builders for every line of business.",
};

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
