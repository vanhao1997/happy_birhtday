export default function BirthdayLoading() {
  return (
    <main className="birthday-page">
      <section className="birthday-shell is-loading" aria-live="polite">
        <div className="skeleton-block wide" />
        <div className="skeleton-block" />
        <div className="skeleton-row">
          <span />
          <span />
          <span />
        </div>
      </section>
    </main>
  );
}
