insert into public.workspaces (id, name, slug, billing_plan, billing_status)
values
  ('11111111-1111-4111-8111-111111111111', 'Demo Birthday Workspace', 'demo-birthday', 'demo', 'trialing')
on conflict (id) do nothing;

-- After creating a Supabase Auth admin user, add membership with that auth.users.id:
-- insert into public.workspace_members (workspace_id, user_id, email, role)
-- values ('11111111-1111-4111-8111-111111111111', '<auth-user-id>', 'admin@example.com', 'owner');

insert into public.campaigns (
  id,
  workspace_id,
  slug,
  title,
  subtitle,
  locale,
  timezone,
  status,
  theme,
  settings
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'thang-8-ruc-ro',
  'Tháng 8 rực rỡ',
  'Bốn mảnh ghép nhỏ dành cho đồng đội tháng 8',
  'vi-VN',
  'Asia/Bangkok',
  'published',
  '{"accent":"#e85d75","background":"#fff7ed","mode":"warm"}'::jsonb,
  '{"requiredChapters":4,"recipientVerification":"none"}'::jsonb
)
on conflict (id) do nothing;

insert into public.recipients (
  id,
  workspace_id,
  campaign_id,
  slug,
  display_name,
  relation_label,
  birthday_date,
  status
)
values
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'mai', 'Mai', 'Người giữ nhịp dự án', '1996-08-05', 'active'),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'quan', 'Quân', 'Người gỡ việc khó', '1994-08-18', 'active'),
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'huong', 'Hương', 'Người làm sáng cuộc họp', '1998-08-27', 'active')
on conflict (id) do nothing;

update public.recipients
set metadata = case slug
  when 'mai' then '{"accent":"pear","character":"Chim dẫn đường giữ nhịp"}'::jsonb
  when 'quan' then '{"accent":"cyan","character":"Cáo bản đồ chuyên tìm lối tắt"}'::jsonb
  when 'huong' then '{"accent":"coral","character":"Đom đóm ghi chú mang đèn coral"}'::jsonb
  else metadata
end
where campaign_id = '22222222-2222-4222-8222-222222222222';

insert into public.chapters (
  id,
  workspace_id,
  campaign_id,
  recipient_id,
  order_index,
  title,
  body,
  prompt,
  options
)
values
  ('44444444-0001-4001-8001-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 1, 'Mảnh ghép đầu tiên', 'Mai, hôm nay bắt đầu bằng một lời nhắc nhỏ: đóng góp của bạn đang làm đội chạy vững hơn.', 'Chọn năng lượng bạn muốn mang vào quý tới.', '[{"key":"focus","label":"Tập trung hơn","response":"Sự tập trung đã được ghi vào điều ước đầu tiên."},{"key":"steady","label":"Vững nhịp hơn","response":"Nhịp làm việc vững vàng đã mở khóa chương tiếp theo."}]'::jsonb),
  ('44444444-0001-4002-8001-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 2, 'Một ký ức sáng', 'Có những lúc một lần hỗ trợ đúng chỗ làm cả sprint nhẹ hơn.', 'Khoảnh khắc nào hợp với hôm nay nhất?', '[{"key":"handoff","label":"Một bàn giao gọn gàng","response":"Bàn giao gọn đã được cất vào hộp quà."},{"key":"save","label":"Một lần cứu tiến độ","response":"Pha cứu tiến độ đã thành dấu mốc thứ hai."}]'::jsonb),
  ('44444444-0001-4003-8001-000000000003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 3, 'Điều ước kín đáo', 'Nếu tuổi mới có thêm một khoảng trống đẹp, mong nó dành cho việc bạn thật sự muốn làm.', 'Bạn muốn đội gửi thêm điều gì?', '[{"key":"time","label":"Thêm thời gian tập trung","response":"Thời gian tập trung đã được đặt cạnh lời chúc."},{"key":"thanks","label":"Thêm lời cảm ơn","response":"Lời cảm ơn từ đội đã sẵn sàng."}]'::jsonb),
  ('44444444-0001-4004-8001-000000000004', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 4, 'Cánh cửa cuối', 'Bốn mảnh ghép đủ rồi. Chỉ còn một bước để mở món quà riêng từ đội.', 'Sẵn sàng nhận quà tháng 8 chứ?', '[{"key":"ready","label":"Sẵn sàng","response":"Quà đã sẵn sàng để mở."},{"key":"very-ready","label":"Rất sẵn sàng","response":"Cánh cửa cuối đã mở."}]'::jsonb),
  ('44444444-0002-4001-8002-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 1, 'Mảnh ghép đầu tiên', 'Quân, hôm nay bắt đầu bằng một lời nhắc nhỏ: đóng góp của bạn đang làm đội chạy vững hơn.', 'Chọn năng lượng bạn muốn mang vào quý tới.', '[{"key":"focus","label":"Tập trung hơn","response":"Sự tập trung đã được ghi vào điều ước đầu tiên."},{"key":"steady","label":"Vững nhịp hơn","response":"Nhịp làm việc vững vàng đã mở khóa chương tiếp theo."}]'::jsonb),
  ('44444444-0002-4002-8002-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 2, 'Một ký ức sáng', 'Có những lúc một lần hỗ trợ đúng chỗ làm cả sprint nhẹ hơn.', 'Khoảnh khắc nào hợp với hôm nay nhất?', '[{"key":"handoff","label":"Một bàn giao gọn gàng","response":"Bàn giao gọn đã được cất vào hộp quà."},{"key":"save","label":"Một lần cứu tiến độ","response":"Pha cứu tiến độ đã thành dấu mốc thứ hai."}]'::jsonb),
  ('44444444-0002-4003-8002-000000000003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 3, 'Điều ước kín đáo', 'Nếu tuổi mới có thêm một khoảng trống đẹp, mong nó dành cho việc bạn thật sự muốn làm.', 'Bạn muốn đội gửi thêm điều gì?', '[{"key":"time","label":"Thêm thời gian tập trung","response":"Thời gian tập trung đã được đặt cạnh lời chúc."},{"key":"thanks","label":"Thêm lời cảm ơn","response":"Lời cảm ơn từ đội đã sẵn sàng."}]'::jsonb),
  ('44444444-0002-4004-8002-000000000004', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 4, 'Cánh cửa cuối', 'Bốn mảnh ghép đủ rồi. Chỉ còn một bước để mở món quà riêng từ đội.', 'Sẵn sàng nhận quà tháng 8 chứ?', '[{"key":"ready","label":"Sẵn sàng","response":"Quà đã sẵn sàng để mở."},{"key":"very-ready","label":"Rất sẵn sàng","response":"Cánh cửa cuối đã mở."}]'::jsonb),
  ('44444444-0003-4001-8003-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 1, 'Mảnh ghép đầu tiên', 'Hương, hôm nay bắt đầu bằng một lời nhắc nhỏ: đóng góp của bạn đang làm đội chạy vững hơn.', 'Chọn năng lượng bạn muốn mang vào quý tới.', '[{"key":"focus","label":"Tập trung hơn","response":"Sự tập trung đã được ghi vào điều ước đầu tiên."},{"key":"steady","label":"Vững nhịp hơn","response":"Nhịp làm việc vững vàng đã mở khóa chương tiếp theo."}]'::jsonb),
  ('44444444-0003-4002-8003-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 2, 'Một ký ức sáng', 'Có những lúc một lần hỗ trợ đúng chỗ làm cả sprint nhẹ hơn.', 'Khoảnh khắc nào hợp với hôm nay nhất?', '[{"key":"handoff","label":"Một bàn giao gọn gàng","response":"Bàn giao gọn đã được cất vào hộp quà."},{"key":"save","label":"Một lần cứu tiến độ","response":"Pha cứu tiến độ đã thành dấu mốc thứ hai."}]'::jsonb),
  ('44444444-0003-4003-8003-000000000003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 3, 'Điều ước kín đáo', 'Nếu tuổi mới có thêm một khoảng trống đẹp, mong nó dành cho việc bạn thật sự muốn làm.', 'Bạn muốn đội gửi thêm điều gì?', '[{"key":"time","label":"Thêm thời gian tập trung","response":"Thời gian tập trung đã được đặt cạnh lời chúc."},{"key":"thanks","label":"Thêm lời cảm ơn","response":"Lời cảm ơn từ đội đã sẵn sàng."}]'::jsonb),
  ('44444444-0003-4004-8003-000000000004', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 4, 'Cánh cửa cuối', 'Bốn mảnh ghép đủ rồi. Chỉ còn một bước để mở món quà riêng từ đội.', 'Sẵn sàng nhận quà tháng 8 chứ?', '[{"key":"ready","label":"Sẵn sàng","response":"Quà đã sẵn sàng để mở."},{"key":"very-ready","label":"Rất sẵn sàng","response":"Cánh cửa cuối đã mở."}]'::jsonb)
on conflict (id) do nothing;

update public.chapters
set metadata = jsonb_build_object(
  'gameType', case order_index
    when 1 then 'memory_piece'
    when 2 then 'detail_hunt'
    when 3 then 'message_unlock'
    else 'story_branch'
  end,
  'estimatedSeconds', 75,
  'noFailPath', true
)
where campaign_id = '22222222-2222-4222-8222-222222222222';

update public.chapters
set body = case
  when recipient_id = '33333333-3333-4333-8333-333333333331' and order_index = 1 then 'Mai, điều đầu tiên cả đội muốn giữ lại là những lần bạn gom đầu việc rời rạc thành một kế hoạch ai cũng theo được.'
  when recipient_id = '33333333-3333-4333-8333-333333333331' and order_index = 2 then 'Một ký ức chỉ thuộc về bạn: buổi chiều bạn đổi lịch ba nhóm để bản release vẫn kịp mà không ai phải chạy quá sức.'
  when recipient_id = '33333333-3333-4333-8333-333333333331' and order_index = 3 then '“Mai luôn biết lúc nào cần kéo cả đội về cùng một nhịp.” — Đội dự án. Tuổi mới, cả đội mong bạn có nhiều khoảng tập trung sâu.'
  when recipient_id = '33333333-3333-4333-8333-333333333331' and order_index = 4 then 'Nhân vật chim dẫn đường giữ nhịp đã đi cùng bạn tới trang cuối. Mọi lựa chọn đều dẫn tới món quà riêng.'
  when recipient_id = '33333333-3333-4333-8333-333333333332' and order_index = 1 then 'Quân, điều đầu tiên cả đội muốn giữ lại là cách bạn bóc một vấn đề lớn thành vài bước nhỏ có thể bắt đầu ngay.'
  when recipient_id = '33333333-3333-4333-8333-333333333332' and order_index = 2 then 'Một ký ức chỉ thuộc về bạn: lần bạn tìm ra nguyên nhân lỗi trước giờ demo và vẫn kịp giải thích để cả đội hiểu.'
  when recipient_id = '33333333-3333-4333-8333-333333333332' and order_index = 3 then '“Quân làm việc khó bớt đáng sợ vì luôn chỉ ra bước tiếp theo.” — Đội dự án. Tuổi mới, cả đội mong bạn có bài toán đủ khó để thấy vui.'
  when recipient_id = '33333333-3333-4333-8333-333333333332' and order_index = 4 then 'Nhân vật cáo bản đồ chuyên tìm lối tắt đã đi cùng bạn tới trang cuối. Mọi lựa chọn đều dẫn tới món quà riêng.'
  when recipient_id = '33333333-3333-4333-8333-333333333333' and order_index = 1 then 'Hương, điều đầu tiên cả đội muốn giữ lại là những câu hỏi ngắn giúp cuộc họp đi thẳng vào điều quan trọng.'
  when recipient_id = '33333333-3333-4333-8333-333333333333' and order_index = 2 then 'Một ký ức chỉ thuộc về bạn: buổi retro bạn biến một đoạn im lặng dài thành cuộc nói chuyện rõ ràng và tử tế.'
  when recipient_id = '33333333-3333-4333-8333-333333333333' and order_index = 3 then '“Hương khiến mọi người dễ nói thật hơn mà vẫn thấy được tôn trọng.” — Đội dự án. Tuổi mới, cả đội mong bạn có nhiều ngày kết thúc đúng giờ.'
  when recipient_id = '33333333-3333-4333-8333-333333333333' and order_index = 4 then 'Nhân vật đom đóm ghi chú mang đèn coral đã đi cùng bạn tới trang cuối. Mọi lựa chọn đều dẫn tới món quà riêng.'
  else body
end
where campaign_id = '22222222-2222-4222-8222-222222222222';

insert into public.messages (
  id,
  workspace_id,
  campaign_id,
  recipient_id,
  sender_label,
  body,
  consent_status,
  reveal_after_order
)
values
  ('55555555-5555-4555-8555-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 'Đội dự án', 'Sinh nhật vui nhé Mai. Cảm ơn bạn đã giữ nhịp cho cả nhóm trong những đoạn nhiều việc.', 'approved', 4),
  ('55555555-5555-4555-8555-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 'Đội dự án', 'Chúc mừng sinh nhật Quân. Những lần bạn gỡ việc khó giúp cả đội đi nhanh hơn nhiều.', 'approved', 4),
  ('55555555-5555-4555-8555-000000000003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'Đội dự án', 'Chúc mừng sinh nhật Hương. Cảm ơn bạn vì luôn làm cuộc họp sáng và rõ hơn.', 'approved', 4)
on conflict (id) do nothing;

insert into public.vouchers (
  id,
  workspace_id,
  campaign_id,
  recipient_id,
  code_ciphertext,
  code_hint,
  title,
  description,
  terms
)
values
  ('77777777-7777-4777-8777-000000000001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333331', 'placeholder:MAI-CA-PHE-THANG-8', 'Thay bằng admin API để mã được mã hóa bằng APP_ENCRYPTION_KEY', 'Phiếu cà phê sáng cho ngày họp nhẹ', 'Voucher cá nhân cho Mai.', 'Dùng một lần, ưu tiên lịch làm việc của người nhận.'),
  ('77777777-7777-4777-8777-000000000002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333332', 'placeholder:QUAN-AN-TRUA-TEAM', 'Thay bằng admin API để mã được mã hóa bằng APP_ENCRYPTION_KEY', 'Voucher ăn trưa cùng đội', 'Voucher cá nhân cho Quân.', 'Dùng một lần, ưu tiên lịch làm việc của người nhận.'),
  ('77777777-7777-4777-8777-000000000003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'placeholder:HUONG-SACH-THANG-8', 'Thay bằng admin API để mã được mã hóa bằng APP_ENCRYPTION_KEY', 'Phiếu sách cho góc làm việc mới', 'Voucher cá nhân cho Hương.', 'Dùng một lần, ưu tiên lịch làm việc của người nhận.')
on conflict (id) do nothing;
