import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D Puzzler",
  description: "A tactile 3D polyomino puzzle board.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
