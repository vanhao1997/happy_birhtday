"use client";

import { useEffect } from "react";

export default function BirthdayError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="route-state-page">
      <section className="route-state-box" role="alert">
        <p className="eyebrow">Lỗi</p>
        <h1>Không mở được câu chuyện</h1>
        <p>Thử tải lại đoạn này hoặc quay về màn chọn tên.</p>
        <button type="button" onClick={() => unstable_retry()}>
          Tải lại
        </button>
      </section>
    </main>
  );
}
