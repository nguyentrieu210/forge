import type { DocumentArchetype } from "./document-presentation.js";

export interface DocumentExperienceProfile {
  accentClass: string;
  heroClass: string;
  iconClass: string;
  metricClass: string;
  kickerClass: string;
  railTitle: string;
  railDescription: string;
}

const PROFILES: Record<DocumentArchetype, DocumentExperienceProfile> = {
  master: {
    accentClass: "bg-violet-500",
    heroClass: "bg-gradient-to-r from-violet-500/[0.07] via-card/95 to-card/95",
    iconClass: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
    metricClass: "border-violet-500/15 bg-violet-500/[0.04]",
    kickerClass: "text-violet-700 dark:text-violet-300",
    railTitle: "Quan hệ & phân loại",
    railDescription: "Thông tin nhận diện, phân nhóm và liên hệ chính của hồ sơ.",
  },
  transaction: {
    accentClass: "bg-primary",
    heroClass: "bg-gradient-to-r from-primary/[0.07] via-card/95 to-card/95",
    iconClass: "bg-primary/10 text-primary ring-primary/20",
    metricClass: "border-primary/15 bg-primary/[0.04]",
    kickerClass: "text-primary",
    railTitle: "Điều kiện giao dịch",
    railDescription: "Ngày, công ty, kho, tiền tệ và các điều kiện cần đọc nhanh trước khi xử lý.",
  },
  inventory: {
    accentClass: "bg-cyan-500",
    heroClass: "bg-gradient-to-r from-cyan-500/[0.07] via-card/95 to-card/95",
    iconClass: "bg-cyan-500/10 text-cyan-700 ring-cyan-500/20 dark:text-cyan-300",
    metricClass: "border-cyan-500/15 bg-cyan-500/[0.04]",
    kickerClass: "text-cyan-700 dark:text-cyan-300",
    railTitle: "Nguồn, đích & thời điểm",
    railDescription: "Ngữ cảnh dịch chuyển kho giúp đối chiếu nơi đi, nơi đến và thời điểm ghi nhận.",
  },
  production: {
    accentClass: "bg-orange-500",
    heroClass: "bg-gradient-to-r from-orange-500/[0.08] via-card/95 to-card/95",
    iconClass: "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300",
    metricClass: "border-orange-500/15 bg-orange-500/[0.04]",
    kickerClass: "text-orange-700 dark:text-orange-300",
    railTitle: "Kế hoạch thực thi",
    railDescription: "Sản phẩm, lịch chạy, kho WIP và kho thành phẩm của lệnh sản xuất.",
  },
  approval: {
    accentClass: "bg-amber-500",
    heroClass: "bg-gradient-to-r from-amber-500/[0.08] via-card/95 to-card/95",
    iconClass: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
    metricClass: "border-amber-500/15 bg-amber-500/[0.04]",
    kickerClass: "text-amber-700 dark:text-amber-300",
    railTitle: "Căn cứ phê duyệt",
    railDescription: "Người yêu cầu, bộ phận, mức ưu tiên và dữ liệu cần thiết cho quyết định.",
  },
  ledger: {
    accentClass: "bg-emerald-500",
    heroClass: "bg-gradient-to-r from-emerald-500/[0.07] via-card/95 to-card/95",
    iconClass: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
    metricClass: "border-emerald-500/15 bg-emerald-500/[0.04]",
    kickerClass: "text-emerald-700 dark:text-emerald-300",
    railTitle: "Hạch toán & đối tượng",
    railDescription: "Tài khoản, đối tượng, phương thức thanh toán và chiều tiền của chứng từ.",
  },
  analysis: {
    accentClass: "bg-indigo-500",
    heroClass: "bg-gradient-to-r from-indigo-500/[0.07] via-card/95 to-card/95",
    iconClass: "bg-indigo-500/10 text-indigo-700 ring-indigo-500/20 dark:text-indigo-300",
    metricClass: "border-indigo-500/15 bg-indigo-500/[0.04]",
    kickerClass: "text-indigo-700 dark:text-indigo-300",
    railTitle: "Phạm vi phân tích",
    railDescription: "Khoảng thời gian, công ty và chiều dữ liệu đang được tổng hợp trong màn phân tích.",
  },
  generic: {
    accentClass: "bg-slate-500",
    heroClass: "bg-card/95",
    iconClass: "bg-muted text-foreground ring-border",
    metricClass: "border-border bg-muted/25",
    kickerClass: "text-primary",
    railTitle: "Thông tin nhanh",
    railDescription: "Các dữ liệu giúp đọc chứng từ mà không phải rà từng ô trong biểu mẫu.",
  },
};

export function resolveDocumentExperienceProfile(archetype: DocumentArchetype): DocumentExperienceProfile {
  return PROFILES[archetype] ?? PROFILES.generic;
}
