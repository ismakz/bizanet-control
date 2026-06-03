import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BizaNet Control",
  description: "Internet business control for Starlink-powered networks.",
  icons: {
    icon: "/bizanet-logo.png",
    apple: "/bizanet-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-[Space_Grotesk] bg-background text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}

