import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DemandCast — Forecast Desk",
  description:
    "Explore real retail sales forecasts, evaluate an attention GRU against a matched seasonal baseline, and inspect data quality in DemandCast.",
  keywords:
    "demand forecasting, retail analytics, attention GRU, recurrent neural network, forecast evaluation",
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
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
