import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ReSource",
    template: "%s | ReSource",
  },
  description: "A redesigned retrieval desk for grounded answers over private PDFs.",
  openGraph: {
    title: "ReSource",
    description: "A redesigned retrieval desk for grounded answers over private PDFs.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ReSource",
    description: "A redesigned retrieval desk for grounded answers over private PDFs.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
