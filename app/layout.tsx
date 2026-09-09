import "./globals.css";
export const metadata = {
  title: "TeachCode Content Studio",
  description: "Course content management",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
