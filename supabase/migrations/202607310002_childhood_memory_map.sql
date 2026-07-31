update public.campaigns
set
  subtitle = 'Năm trạm tuổi thơ dành riêng cho đồng đội tháng 8',
  updated_at = now()
where slug = 'thang-8-ruc-ro';

update public.chapters chapter
set
  prompt = case chapter.order_index
    when 1 then 'Mở trạm đầu tiên trên bản đồ tuổi thơ.'
    when 2 then 'Đi tiếp tới trạm thứ hai.'
    when 3 then 'Đi theo đường chấm tới lớp học cũ.'
    else 'Đi hết con đường ước mơ để tới cổng tuổi mới.'
  end,
  options = jsonb_build_array(jsonb_build_object(
    'key', 'station-complete',
    'label', 'Đã khám phá',
    'response', case chapter.order_index
      when 1 then 'Mảnh ký ức đầu tiên đã được giữ lại.'
      when 2 then 'Khoảnh khắc này đã trở thành dấu mốc thứ hai.'
      when 3 then 'Lời nhắn đã được đặt cạnh ký ức thứ ba.'
      else 'Bốn mảnh ký ức đã cùng thắp sáng cánh cổng cuối.'
    end
  )),
  metadata = coalesce(chapter.metadata, '{}'::jsonb) || jsonb_build_object(
    'noFailPath', true,
    'pixelQuest', jsonb_build_object(
      'version', 2,
      'preset', 'childhood-memory-atlas',
      'mapWidthPx', 1200,
      'mapHeightPx', 760,
      'noFailPath', true,
      'zones', jsonb_build_array(
        jsonb_build_object(
          'id', 'childhood-home',
          'title', 'Ngôi nhà tuổi thơ',
          'scene', 'childhood-home',
          'mapXPercent', 14,
          'mapYPercent', 73,
          'npcLine', recipient.display_name || ' ơi, cánh cửa nhỏ đang giữ nơi câu chuyện bắt đầu.'
        ),
        jsonb_build_object(
          'id', 'summer-playground',
          'title', 'Sân chơi mùa hè',
          'scene', 'summer-playground',
          'mapXPercent', 34,
          'mapYPercent', 43,
          'npcLine', 'Một buổi chiều đầy nắng của ' || recipient.display_name || ' vẫn còn nằm giữa sân chơi này.'
        ),
        jsonb_build_object(
          'id', 'old-classroom',
          'title', 'Lớp học ngày xưa',
          'scene', 'old-classroom',
          'mapXPercent', 53,
          'mapYPercent', 66,
          'npcLine', 'Bàn học cũ giữ lại một điều từng khiến ' || recipient.display_name || ' thật tự hào.'
        ),
        jsonb_build_object(
          'id', 'dream-road',
          'title', 'Con đường ước mơ',
          'scene', 'dream-road',
          'mapXPercent', 72,
          'mapYPercent', 34,
          'npcLine', 'Con đường này đi qua những ước mơ nhỏ ' || recipient.display_name || ' từng tin là thật.'
        ),
        jsonb_build_object(
          'id', 'new-age-gate',
          'title', 'Cổng tuổi mới',
          'scene', 'new-age-gate',
          'mapXPercent', 88,
          'mapYPercent', 69,
          'npcLine', 'Bốn mảnh ký ức đã sáng. Món quà riêng của ' || recipient.display_name || ' đang ở phía sau cổng.'
        )
      )
    )
  ),
  updated_at = now()
from public.recipients recipient
where chapter.recipient_id = recipient.id
  and chapter.campaign_id = recipient.campaign_id
  and chapter.workspace_id = recipient.workspace_id
  and chapter.campaign_id in (
    select campaign.id
    from public.campaigns campaign
    where campaign.slug = 'thang-8-ruc-ro'
  );
