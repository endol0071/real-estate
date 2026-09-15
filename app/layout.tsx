import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "집노트 | 나의 다음 집을 위한 리서치", description: "예산과 직장에 맞춰 서울·경기 아파트의 실거주성과 투자성을 함께 비교하는 부동산 리서치" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
