export const metadata = {
  title: 'The Social Hive',
  description: 'Community events for Fullerton Cove residents',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#0f1117', color: '#fff' }}>
        {children}
      </body>
    </html>
  )
}
