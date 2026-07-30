export default function AdminLoading() {
  return (
    <main className="admin-page">
      <section className="admin-login-panel" aria-live="polite">
        <div className="skeleton-block wide" />
        <div className="skeleton-block" />
        <div className="skeleton-row">
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
