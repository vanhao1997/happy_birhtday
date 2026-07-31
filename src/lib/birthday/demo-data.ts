import { encryptSecret } from "./crypto";
import { DEFAULT_PIXEL_QUEST, pixelQuestToJson } from "./dto";
import { APP_TIMEZONE, type Campaign, type Chapter, type Recipient, type Voucher, type Workspace } from "./types";
import { nowIso } from "./time";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const campaignId = "22222222-2222-4222-8222-222222222222";

const recipientSeeds = [
  {
    id: "33333333-3333-4333-8333-333333333331",
    slug: "mai",
    displayName: "Mai",
    relationLabel: "Người giữ nhịp dự án",
    birthdayDate: "1996-08-05",
    character: "Chim dẫn đường giữ nhịp",
    childCharacterName: "Bé Mai Mây",
    childCharacterTrait: "Hay gom những mẩu chuyện nhỏ vào chiếc túi màu lê",
    childCharacterArchetype: "princess",
    strength: "những lần bạn gom đầu việc rời rạc thành một kế hoạch ai cũng theo được",
    memory: "buổi chiều bạn đổi lịch ba nhóm để bản release vẫn kịp mà không ai phải chạy quá sức",
    teammateNote: "Mai luôn biết lúc nào cần kéo cả đội về cùng một nhịp.",
    wish: "một năm có nhiều khoảng tập trung sâu và ít cuộc họp chen ngang",
    voucherCode: "MAI-CA-PHE-THANG-8",
    voucherTitle: "Phiếu cà phê sáng cho ngày họp nhẹ",
  },
  {
    id: "33333333-3333-4333-8333-333333333332",
    slug: "quan",
    displayName: "Quân",
    relationLabel: "Người gỡ việc khó",
    birthdayDate: "1994-08-18",
    character: "Cáo bản đồ chuyên tìm lối tắt",
    childCharacterName: "Bé Quân La Bàn",
    childCharacterTrait: "Tò mò, nhanh trí và luôn muốn biết con đường kế tiếp",
    childCharacterArchetype: "prince",
    strength: "cách bạn bóc một vấn đề lớn thành vài bước nhỏ có thể bắt đầu ngay",
    memory: "lần bạn tìm ra nguyên nhân lỗi trước giờ demo và vẫn kịp giải thích để cả đội hiểu",
    teammateNote: "Quân làm việc khó bớt đáng sợ vì luôn chỉ ra bước tiếp theo.",
    wish: "thêm những bài toán đủ khó để thấy vui, nhưng không lấy mất cuối tuần",
    voucherCode: "QUAN-AN-TRUA-TEAM",
    voucherTitle: "Voucher ăn trưa cùng đội",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "huong",
    displayName: "Hương",
    relationLabel: "Người làm sáng cuộc họp",
    birthdayDate: "1998-08-27",
    character: "Đom đóm ghi chú mang đèn coral",
    childCharacterName: "Bé Hương Đom Đóm",
    childCharacterTrait: "Mang theo một chiếc đèn nhỏ để soi sáng từng kỷ niệm",
    childCharacterArchetype: "emperor",
    strength: "những câu hỏi ngắn giúp cuộc họp đi thẳng vào điều quan trọng",
    memory: "buổi retro bạn biến một đoạn im lặng dài thành cuộc nói chuyện rõ ràng và tử tế",
    teammateNote: "Hương khiến mọi người dễ nói thật hơn mà vẫn thấy được tôn trọng.",
    wish: "nhiều ý tưởng mới, nhiều ngày kết thúc đúng giờ và một góc làm việc thật sáng",
    voucherCode: "HUONG-SACH-THANG-8",
    voucherTitle: "Phiếu sách cho góc làm việc mới",
  },
] as const;

export interface DemoData {
  workspace: Workspace;
  campaign: Campaign;
  recipients: Recipient[];
  chapters: Chapter[];
  vouchers: Voucher[];
}

export function createDemoData(): DemoData {
  const timestamp = nowIso();
  const workspace: Workspace = {
    id: workspaceId,
    name: "Demo Birthday Workspace",
    slug: "demo-birthday",
    billingPlan: "demo",
    billingStatus: "trial",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const campaign: Campaign = {
    id: campaignId,
    workspaceId,
    slug: "thang-8-ruc-ro",
    title: "Tháng 8 rực rỡ",
    subtitle: "Năm trạm tuổi thơ dành riêng cho đồng đội tháng 8",
    locale: "vi-VN",
    timezone: APP_TIMEZONE,
    status: "published",
    startsAt: null,
    endsAt: null,
    theme: {
      accent: "#e85d75",
      background: "#fff7ed",
      mode: "warm",
    },
    settings: {
      requiredChapters: 4,
      recipientVerification: "none",
    },
    createdBy: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const recipients = recipientSeeds.map((seed, index): Recipient => ({
    id: seed.id,
    workspaceId,
    campaignId,
    slug: seed.slug,
    displayName: seed.displayName,
    relationLabel: seed.relationLabel,
    birthdayDate: seed.birthdayDate,
    avatarUrl: null,
    status: "active",
    metadata: {
      character: seed.character,
      childCharacterName: seed.childCharacterName,
      childCharacterTrait: seed.childCharacterTrait,
      childCharacterArchetype: seed.childCharacterArchetype,
      accent: (["pear", "cyan", "coral"] as const)[index % 3],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const chapters = recipientSeeds.flatMap((seed, recipientIndex) =>
    chapterCopies(seed, recipientIndex + 1, timestamp),
  );

  const vouchers = recipientSeeds.map((seed, index): Voucher => ({
    id: `77777777-7777-4777-8777-00000000000${index + 1}`,
    workspaceId,
    campaignId,
    recipientId: seed.id,
    codeCiphertext: encryptSecret(seed.voucherCode),
    codeHint: "Mã quà chỉ mở sau khi máy chủ xác nhận đủ năm trạm ký ức",
    title: seed.voucherTitle,
    description: `Voucher cá nhân cho ${seed.displayName}.`,
    terms: "Dùng một lần, ưu tiên ngày rảnh của người nhận.",
    revealedAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  return { workspace, campaign, recipients, chapters, vouchers };
}

function chapterCopies(
  seed: (typeof recipientSeeds)[number],
  recipientIndex: number,
  timestamp: string,
): Chapter[] {
  const { id: recipientId, displayName } = seed;
  return [
    {
      id: chapterId(recipientIndex, 1),
      workspaceId,
      campaignId,
      recipientId,
      orderIndex: 1,
      title: "Mảnh ghép đầu tiên",
      body: `${displayName}, điều đầu tiên cả đội muốn giữ lại là ${seed.strength}.`,
      prompt: "Mở trạm đầu tiên trên bản đồ tuổi thơ.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Mảnh ký ức đầu tiên đã được giữ lại." },
      ],
      mediaAssetId: null,
      isPublished: true,
      metadata: {
        gameType: "memory_piece",
        estimatedSeconds: 75,
        noFailPath: true,
        pixelQuest: pixelQuestFor(displayName),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: chapterId(recipientIndex, 2),
      workspaceId,
      campaignId,
      recipientId,
      orderIndex: 2,
      title: "Một ký ức sáng",
      body: `Một ký ức chỉ thuộc về bạn: ${seed.memory}.`,
      prompt: "Đi tiếp tới trạm thứ hai.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Khoảnh khắc này đã trở thành dấu mốc thứ hai." },
      ],
      mediaAssetId: null,
      isPublished: true,
      metadata: {
        gameType: "detail_hunt",
        estimatedSeconds: 75,
        noFailPath: true,
        pixelQuest: pixelQuestFor(displayName),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: chapterId(recipientIndex, 3),
      workspaceId,
      campaignId,
      recipientId,
      orderIndex: 3,
      title: "Điều ước kín đáo",
      body: `“${seed.teammateNote}” — Đội dự án. Tuổi mới, cả đội mong bạn có ${seed.wish}.`,
      prompt: "Đi theo đường chấm tới lớp học cũ.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Lời nhắn đã được đặt cạnh ký ức thứ ba." },
      ],
      mediaAssetId: null,
      isPublished: true,
      metadata: {
        gameType: "message_unlock",
        estimatedSeconds: 75,
        noFailPath: true,
        pixelQuest: pixelQuestFor(displayName),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: chapterId(recipientIndex, 4),
      workspaceId,
      campaignId,
      recipientId,
      orderIndex: 4,
      title: "Cánh cửa cuối",
      body: `Nhân vật ${seed.character.toLowerCase()} đã đi cùng bạn tới trang cuối. Mọi lựa chọn đều dẫn tới món quà riêng.`,
      prompt: "Đi hết con đường ước mơ để tới cổng tuổi mới.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Bốn mảnh ký ức đã cùng thắp sáng cánh cổng cuối." },
      ],
      mediaAssetId: null,
      isPublished: true,
      metadata: {
        gameType: "story_branch",
        estimatedSeconds: 75,
        noFailPath: true,
        pixelQuest: pixelQuestFor(displayName),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function pixelQuestFor(displayName: string) {
  const lines = [
    `${displayName} ơi, cánh cửa nhỏ đang giữ nơi câu chuyện bắt đầu.`,
    `Một buổi chiều đầy nắng của ${displayName} vẫn còn nằm giữa sân chơi này.`,
    `Bàn học cũ giữ lại một điều từng khiến ${displayName} thật tự hào.`,
    `Con đường này đi qua những ước mơ nhỏ ${displayName} từng tin là thật.`,
    `Bốn mảnh ký ức đầu đã sáng. Món quà riêng của ${displayName} đang ở phía sau cổng.`,
  ];
  const zones = DEFAULT_PIXEL_QUEST.zones.map((zone, index) => ({
    ...zone,
    npcLine: lines[index] ?? zone.npcLine,
  }));
  return pixelQuestToJson({
    ...DEFAULT_PIXEL_QUEST,
    zones,
    npcs: DEFAULT_PIXEL_QUEST.npcs.map((npc, index) => ({
      ...npc,
      line: lines[index] ?? npc.line,
    })),
  });
}

function chapterId(recipientIndex: number, orderIndex: number): string {
  return `44444444-${recipientIndex.toString().padStart(4, "0")}-400${orderIndex}-800${recipientIndex}-00000000000${orderIndex}`;
}
