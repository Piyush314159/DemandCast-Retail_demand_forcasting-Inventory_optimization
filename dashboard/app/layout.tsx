import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemandCast — Retail Demand Forecasting Platform",
  description: "AI-powered retail SKU-level demand forecasting, inventory optimization, and model management platform built on LightGBM, SARIMA, and Prophet.",
  keywords: "demand forecasting, retail analytics, inventory optimization, LightGBM, AI dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
