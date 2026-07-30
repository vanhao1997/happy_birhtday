import type {
  BirthdayCampaign,
  BirthdayChapter,
  RecipientProfile,
  VoucherOption,
} from "./types";

export const DEFAULT_RECIPIENTS: RecipientProfile[] = [
  {
    slug: "linh",
    name: "Linh",
    initials: "LH",
    note: "Thích lời chúc nhẹ và một chút bất ngờ.",
    palette: "pear",
  },
  {
    slug: "an",
    name: "An",
    initials: "AN",
    note: "Hợp với một cuốn truyện sinh nhật gọn, ấm.",
    palette: "cyan",
  },
  {
    slug: "minh",
    name: "Minh",
    initials: "MN",
    note: "Cần hành trình vui, chậm rãi, có quà ở cuối.",
    palette: "coral",
  },
];

const CHAPTERS: BirthdayChapter[] = [
  {
    id: "door",
    title: "Mở cửa",
    scene: "Cánh cửa giấy mở ra, một dải băng nhỏ hiện lên tên người nhận.",
    prompt: "Lời nào nên đặt ở trang đầu?",
    choices: [
      {
        id: "gentle",
        label: "Hôm nay chậm lại",
        reply: "Trang đầu dịu xuống. Những lời chúc sau đó đi theo nhịp ấm.",
      },
      {
        id: "bright",
        label: "Bật đèn lên",
        reply: "Cuốn truyện sáng hơn. Các màn tiếp theo có nhiều khoảnh khắc vui.",
      },
      {
        id: "quiet",
        label: "Giữ bí mật",
        reply: "Một ngăn kéo nhỏ khóa lại. Quà cuối sẽ mở sau chương bốn.",
      },
    ],
  },
  {
    id: "memory",
    title: "Ngăn ký ức",
    scene: "Ba miếng giấy xếp thành một đường dẫn ngang qua phòng.",
    prompt: "Chọn ký ức muốn giữ lại lâu nhất.",
    choices: [
      {
        id: "coffee",
        label: "Ly nước đầu ngày",
        reply: "Một vệt cyan nằm lại trên lề trang, nhỏ như một buổi sáng tốt.",
      },
      {
        id: "walk",
        label: "Lần đi bộ lâu",
        reply: "Dải băng giấy chạy dài hơn, như cuộc nói chuyện không cần gấp.",
      },
      {
        id: "laugh",
        label: "Một trận cười",
        reply: "Trang sách rung nhẹ. Không ồn ào, chỉ vừa đủ để nhớ.",
      },
    ],
  },
  {
    id: "wish",
    title: "Lời ước",
    scene: "Một chiếc đèn bàn nhỏ rọi ánh sáng lên dòng chữ viết tay.",
    prompt: "Điều gì nên được gửi vào năm mới?",
    choices: [
      {
        id: "rest",
        label: "Nhiều ngày để thở",
        reply: "Cuốn sách dành thêm khoảng trắng. Lời chúc này biết để người nhận nghỉ.",
      },
      {
        id: "brave",
        label: "Một việc dám thử",
        reply: "Nét coral đậm hơn. Lời chúc có sức đẩy nhưng không ép.",
      },
      {
        id: "kind",
        label: "Người tốt ở gần",
        reply: "Viền pear mềm lại. Lời chúc đi theo cách chăm sóc nhẹ.",
      },
    ],
  },
  {
    id: "gift",
    title: "Hộp quà",
    scene: "Hộp quà giấy nằm ở cuối bàn. Chỉ mở khi tất cả trang đã được đọc.",
    prompt: "Chốt cảm giác cho phiếu quà tặng.",
    choices: [
      {
        id: "warm",
        label: "Ấm và gần",
        reply: "Voucher sẽ nói bằng giọng thân mật, hợp với bữa ăn hoặc cafe.",
      },
      {
        id: "fresh",
        label: "Mới và sáng",
        reply: "Voucher sẽ hợp với một trải nghiệm ra ngoài, nhẹ nhàng và vui.",
      },
      {
        id: "kept",
        label: "Giữ riêng",
        reply: "Voucher sẽ hiện như một lời hẹn nhỏ chỉ dành cho người nhận.",
      },
    ],
  },
];

const VOUCHERS: VoucherOption[] = [
  {
    id: "coffee-note",
    label: "Hẹn cafe riêng",
    detail: "Một buổi gặp không vội, để nghe lại các câu chuyện mới.",
  },
  {
    id: "dinner-card",
    label: "Bữa tối ấm",
    detail: "Một bữa tối gọn, có món người nhận thích và không cần lý do thêm.",
  },
  {
    id: "free-day",
    label: "Ngày tự chọn",
    detail: "Một ngày để người nhận chọn việc mình muốn làm.",
  },
];

export function toBirthdaySlug(value: string) {
  const slug = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "nguoi-thuong";
}

export function initialsFromName(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return letters || "BD";
}

export function nameFromSlug(slug: string) {
  const match = DEFAULT_RECIPIENTS.find((recipient) => recipient.slug === slug);

  if (match) {
    return match.name;
  }

  const cleaned = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return cleaned || "Bạn";
}

export function buildBirthdayCampaign(slug: string): BirthdayCampaign {
  const known = DEFAULT_RECIPIENTS.find((recipient) => recipient.slug === slug);
  const recipientName = known?.name ?? nameFromSlug(slug);
  const recipient: RecipientProfile = known ?? {
    slug,
    name: recipientName,
    initials: initialsFromName(recipientName),
    note: "Campaign chưa tải được, nên giao diện dùng truyện mẫu trên thiết bị.",
    palette: "pear",
  };

  return {
    slug,
    title: `Sinh nhật của ${recipient.name}`,
    recipient,
    chapters: CHAPTERS,
    vouchers: VOUCHERS,
  };
}
