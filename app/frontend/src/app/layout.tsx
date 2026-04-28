import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "Voice Studio",
  description: "Qwen3-TTS, Fish Speech S2-Pro, RVC, MMAudio, and ACE-Step production workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
