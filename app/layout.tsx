import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "Recordly",
  description: "Record and share your screen and camera",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Navbar />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}