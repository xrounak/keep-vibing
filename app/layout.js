import { Poppins, Yatra_One } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
});

// bolder, more hand-drawn/decorative Devanagari — matches the chunky
// tilted-letterform look of the busdriver.wtf-style reference
const yatraOne = Yatra_One({
  variable: "--font-hindi",
  subsets: ["devanagari"],
  weight: ["400"],
});

export const metadata = {
  title: "Raat Ka Safar",
  description: "night drives, old songs, borrowed nostalgia",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable} ${yatraOne.variable}`}>
      <body>{children}</body>
    </html>
  );
}
