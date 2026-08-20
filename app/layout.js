import { Poppins, Baloo_Bhai_2 } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
});

const balooBhai2 = Baloo_Bhai_2({
  variable: "--font-hindi",
  subsets: ["devanagari"],
  weight: ["600", "700", "800"],
});

export const metadata = {
  title: "Raat Ka Safar",
  description: "night drives, old songs, borrowed nostalgia",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable} ${balooBhai2.variable}`}>
      <body>{children}</body>
    </html>
  );
}
