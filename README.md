# Web Birthday Story

Một link chung cho chiến dịch sinh nhật tháng 8. Người chơi chọn tên, đi qua bốn chương cá nhân hóa trong khoảng 5–7 phút, sau đó server kiểm tra tiến trình trước khi trả voucher và QR.

Demo mặc định: `http://localhost:3000/birthday/thang-8-ruc-ro` với Mai, Quân và Hương.

## MVP đã triển khai

- Next.js 16 App Router, TypeScript, React 19.
- Public flow 2–5 người nhận, tiếp tục phiên trên cùng thiết bị, âm thanh mặc định tắt.
- Bốn loại chapter cố định: `memory_piece`, `detail_hunt`, `message_unlock`, `story_branch`.
- Không có nhánh thất bại; lựa chọn chỉ thay đổi phản hồi và câu chuyện.
- Session token ngẫu nhiên, chỉ lưu HMAC hash ở database.
- Voucher AES-256-GCM, chỉ giải mã sau bốn chapter được server ghi nhận.
- QR chỉ được tạo trên client sau khi API hoàn thành trả voucher.
- Admin magic link, kiểm tra membership workspace, wizard campaign/recipient/chapter/message/voucher/preview/publish.
- Dashboard trạng thái `chưa chơi/đang chơi/hoàn thành/đã mở voucher`, tự tải lại mỗi 60 giây.
- Supabase Postgres/Auth/Storage-ready, RLS và tenant integrity trigger.
- Demo in-memory tự bật khi chưa có đủ cấu hình Supabase persistent.

## Kiến trúc

Public browser chỉ gọi Route Handlers. Browser không truy cập trực tiếp bảng voucher.

```text
Public/Admin UI
    |
Next.js Route Handlers
    |
BirthdayRepository
    |-- DemoBirthdayRepository (local, không cần env)
    `-- SupabaseBirthdayRepository (production)
             |
        Supabase Postgres/Auth/Storage
```

Public API:

- `GET /api/campaigns/:slug`: picker-safe campaign và recipient DTO.
- `POST /api/sessions`: tạo phiên, trả token một lần và chapter đầu.
- `POST /api/sessions/:token/choices`: ghi lựa chọn tuần tự, idempotent theo chapter/client event.
- `POST /api/sessions/:token/complete`: kiểm tra đủ bốn chapter rồi mới giải mã voucher.

Admin API yêu cầu Supabase bearer token, `workspaceId`, membership hợp lệ và role `owner/admin/editor`. Analytics nằm tại `GET /api/admin/campaigns/:campaignId/analytics`.

## Data model

Mọi bảng nghiệp vụ đều có `workspace_id`:

- `workspaces`, `workspace_members`: tenant và quyền admin.
- `campaigns`: slug chung, timezone, lịch mở/đóng, trạng thái.
- `recipients`: tên, ảnh, màu nhấn, nhân vật đồng hành.
- `chapters`: nội dung và options; loại game nằm tại `metadata.gameType`.
- `messages`: lời nhắn và consent `pending/approved/revoked`.
- `game_sessions`, `choices`, `game_events`: tiến trình và analytics server-side.
- `vouchers`: ciphertext, hint, hạn dùng; không có public select policy.
- `media_assets`, `audit_logs`: media đã duyệt và lịch sử thao tác admin/voucher.

Migration: `supabase/migrations/202607300001_birthday_backend.sql`.

## Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
npm run dev
```

Không tạo `.env.local` vẫn chạy được demo in-memory. Admin sẽ khóa và hiển thị cảnh báo cấu hình.

Kiểm tra chất lượng:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Cấu hình Supabase

1. Tạo Supabase project.
2. Chạy migration bằng Supabase CLI đã link project, sau đó chạy `supabase/seed.sql` trong SQL Editor:

```bash
supabase db push
```

3. Tạo `.env.local` từ `.env.example` và điền:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_DEFAULT_WORKSPACE_ID=11111111-1111-4111-8111-111111111111

APP_ENCRYPTION_KEY=...
SESSION_TOKEN_PEPPER=...
ADMIN_EMAIL_ALLOWLIST=admin@example.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Tạo hai secret độc lập, tối thiểu 32 byte:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Không đưa `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY` hoặc `SESSION_TOKEN_PEPPER` vào biến `NEXT_PUBLIC_*`.

### Magic link và workspace membership

1. Trong Supabase Auth, thêm redirect URL `http://localhost:3000/admin` và URL production.
2. Gửi magic link từ `/admin`, đăng nhập một lần để tạo `auth.users`.
3. Lấy user UUID rồi thêm membership:

```sql
insert into public.workspace_members (workspace_id, user_id, email, role)
values (
  '11111111-1111-4111-8111-111111111111',
  '<auth-user-id>',
  'admin@example.com',
  'owner'
);
```

Seed dùng `placeholder:` để project có dữ liệu xem trước. Trước production, mở từng voucher qua admin API/wizard và lưu lại. Khi đó mã mới được AES-256-GCM bằng `APP_ENCRYPTION_KEY`.

## Analytics

Nguồn ghi: server Route Handlers, realtime vào `game_sessions`, `choices`, `game_events`. Dashboard refresh mỗi 60 giây.

- Grain: `campaign/recipient/chapter/day`.
- Timezone: `Asia/Bangkok`; event có `occurred_date_bkk`.
- Completion rate: `sessions completed / sessions started`.
- Chapter drop-off N: `(sessions arrived N - sessions advanced past N) / sessions arrived N`.
- Voucher reveal rate: `sessions with voucher_revealed_at / completed sessions`.
- Average duration: trung bình `completed_at - started_at` của session hoàn thành.
- Consistency check: số session/reveal được so với unique `session_started` và `voucher_revealed` events.

Dashboard không chứa voucher code, token hash, IP thô hoặc nội dung lời nhắn.

## Bảo mật và trust model

Đây là mô hình tin cậy, không xác minh danh tính người nhận. Bất kỳ ai có link đều có thể chọn tên khác và hoàn thành câu chuyện của họ. Chỉ dùng link nội bộ, voucher giá trị thấp/dùng một lần/thời hạn ngắn, nội dung không nhạy cảm và khả năng revoke.

- Public access đi qua server route; không có public RLS policy cho voucher.
- Session token nằm trong `localStorage` để resume, nhưng voucher plaintext không được lưu tại đó.
- Token database là HMAC hash; voucher database là AES-256-GCM ciphertext.
- Publish yêu cầu 2–5 recipient active, bốn chapter và voucher cho từng người.
- Ảnh/lời nhắn cần consent; tránh dữ liệu lương, sức khỏe, tình cảm hoặc lỗi công việc.
- Security headers: `nosniff`, `DENY` framing, referrer policy và permissions policy.

Rủi ro còn lại:

- `recordChoice` và Story RPG progress dùng Postgres RPC có khóa session, idempotency key và duplicate-safe response; vẫn cần DB smoke test trong CI để chống regression migration/RPC.
- Tạo recipient/chapter/message/voucher là workflow nhiều bước; lỗi giữa chừng giữ campaign ở draft nhưng có thể để dữ liệu một phần.
- Dashboard REST hiện đọc tối đa page mặc định của Supabase; chiến dịch lớn cần pagination/RPC aggregation ở V1.
- Trust model không ngăn người có link xem voucher của người khác.

## Data sync và billing

- Không có connector bên thứ ba trong MVP; dữ liệu sync chỉ là browser → Next.js API → Supabase.
- Mỗi lựa chọn ghi server ngay; dashboard có freshness 60 giây.
- Không có billing người dùng trong MVP.
- Chi phí cần theo dõi: voucher chưa dùng, Supabase Storage/database, Vercel bandwidth/function execution.

## Deploy Vercel

1. Import repository vào Vercel.
2. Khai báo toàn bộ env production; không dùng demo fallback ở production.
3. Đặt `NEXT_PUBLIC_APP_URL` thành domain production.
4. Thêm `${NEXT_PUBLIC_APP_URL}/admin` vào Supabase Auth redirect URLs.
5. Deploy, sau đó chạy smoke test public flow và admin magic link.

`npm run build` là build command; Next.js output dùng mặc định Vercel.

## Phases

### MVP

Đã có shared link, 2–5 người, bốn chapter cá nhân hóa, magic-link admin, publish validation, server-gated voucher/QR, resume cùng thiết bị, consent, analytics/status và responsive/reduced-motion support.

### V1

Thư viện minigame có drag/drop thật, chapter sorter, nhiều admin `owner/editor/viewer`, phone preview, audio/video upload, lịch phát hành, PIN tùy chọn, voucher revoke/used, analytics RPC/pagination và transaction hóa session progression.

### Future

Provider voucher/webhook redemption, AI gợi ý cốt truyện từ dữ liệu đã duyệt, nhiều công ty với tenant isolation nâng cao, template văn hóa nhóm, scheduled reports và phân tích hiệu quả chiến dịch.
