import Link from "next/link";
import { ArrowRight, Gift, Settings } from "lucide-react";
import { DEFAULT_RECIPIENTS } from "./content";

const DEMO_CAMPAIGN_SLUG = "thang-8-ruc-ro";

export function NamePicker() {
  return (
    <main className="entry-page">
      <nav className="entry-nav" aria-label="Điều hướng chính">
        <Link className="brand-mark" href="/" aria-label="Về trang chọn tên">
          <span className="brand-symbol" aria-hidden="true">
            H
          </span>
          <span>Hum</span>
        </Link>
        <Link className="icon-link" href="/admin" aria-label="Mở trang quản trị">
          <Settings size={18} aria-hidden="true" />
          <span>Admin</span>
        </Link>
      </nav>

      <section className="entry-hero" aria-labelledby="entry-title">
        <div className="entry-copy">
          <p className="eyebrow">Sinh nhật đang kể lại</p>
          <h1 id="entry-title">Một cuốn truyện nhỏ cho tháng 8 rực rỡ.</h1>
          <p>
            Vào campaign mẫu, chọn người nhận từ API, đi qua bốn chương ngắn,
            rồi mở voucher riêng ở trang cuối.
          </p>

          <Link className="primary-cta" href={`/birthday/${DEMO_CAMPAIGN_SLUG}`}>
            <Gift size={18} aria-hidden="true" />
            <span>Mở campaign mẫu</span>
          </Link>
        </div>

        <div className="storybook-stage" aria-hidden="true">
          <div className="storybook-spread">
            <div className="storybook-page is-left">
              <span />
            </div>
            <div className="storybook-page is-right">
              <span />
            </div>
          </div>
          <div className="hum-character">
            <span className="hum-head" />
            <span className="hum-body" />
            <span className="hum-arm" />
          </div>
        </div>
      </section>

      <section className="picker-band" aria-labelledby="sample-title">
        <div>
          <p className="eyebrow">Người nhận</p>
          <h2 id="sample-title">Campaign sẽ tải danh sách từ API</h2>
        </div>
        <div className="recipient-strip">
          {DEFAULT_RECIPIENTS.map((recipient) => (
            <Link
              className="recipient-pill"
              key={recipient.slug}
              href={`/birthday/${DEMO_CAMPAIGN_SLUG}`}
            >
              <span className={`initial-badge tone-${recipient.palette}`}>
                {recipient.initials}
              </span>
              <span>
                <strong>{recipient.name}</strong>
                <small>{recipient.note}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <footer className="site-close">
        <span>Hum giữ câu chuyện gọn, riêng tư, và mở đường tới voucher thật.</span>
      </footer>
    </main>
  );
}
