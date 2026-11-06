export default function AuthLayout({ children }) {
  return (
    <main className="login">
      <section className="login__left">
        <div className="login__brand">
          <svg className="login__logo" viewBox="0 0 64 64" role="img" aria-label="Trade History logo">
            <rect width="64" height="64" rx="16" fill="#fff" />
            <path
              d="M12 44 L26 30 L35 38 L52 20"
              fill="none"
              stroke="#6d28d9"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M42 20 H52 V30"
              fill="none"
              stroke="#6d28d9"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="login__brand-name">Trade History</span>
        </div>
      </section>
      <section className="login__right">{children}</section>
    </main>
  )
}
