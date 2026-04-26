import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "Voice Studio",
  description: "Local Qwen3-TTS, Fish Speech S2-Pro, RVC, and audio tool workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
