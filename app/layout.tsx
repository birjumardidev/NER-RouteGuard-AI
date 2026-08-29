import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NER SmartRoute AI",
  description: "Safer route intelligence for Northeast logistics drivers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
