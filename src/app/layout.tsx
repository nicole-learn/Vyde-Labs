import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vyde Labs",
  description:
    "A clean, Fal-powered AI studio for text, image, and video generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
