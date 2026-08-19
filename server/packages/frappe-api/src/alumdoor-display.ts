import type { JsonObject } from "../../contracts/src/index.js";
import type { LinkDisplayRule } from "./vertical-display.js";

/**
 * Cách hiển thị doctype riêng của AlumDoor trong ô chọn link.
 *
 * Tên doctype tiếng Việt "Tài khoản ngân hàng" từng nằm cứng trong `router.ts` ở hai chỗ —
 * lúc dựng danh sách chọn và lúc tra nhãn cho link — nên lõi nền tảng phải biết một doctype
 * của một khách hàng. Nay nó là một luật trong bảng đăng ký; router chỉ tra bảng.
 */
export const ALUMDOOR_BANK_ACCOUNT_DOCTYPE = "Tài khoản ngân hàng";

const DISPLAY_FIELDS = ["bank_name", "account_number", "account_holder"] as const;

export function alumdoorBankAccountLabel(record: JsonObject): string {
  const bank = typeof record.bank_name === "string" ? record.bank_name.trim() : "";
  const account = typeof record.account_number === "string" ? record.account_number.trim() : "";
  const holder = typeof record.account_holder === "string" ? record.account_holder.trim() : "";
  return [bank, account, holder ? `CTK ${holder}` : ""].filter(Boolean).join(" · ")
    || String(record.name ?? "");
}

export const ALUMDOOR_LINK_DISPLAY: Record<string, LinkDisplayRule> = {
  [ALUMDOOR_BANK_ACCOUNT_DOCTYPE]: {
    fields: DISPLAY_FIELDS,
    label: alumdoorBankAccountLabel,
  },
};
