/** @jsxImportSource react */
/**
 * Gợi ý MOTOR + BÌNH LƯU ĐIỆN theo diện tích cửa — đường đi của luật `alumdoor.motor.suggest`
 * tới màn Bán hàng.
 *
 * ── Vì sao panel này tồn tại ─────────────────────────────────────────────────────────────────
 * Luật chọn motor ĐÃ có đủ ở máy chủ từ 19/08:
 *   · bảng tra          `server/apps-src/alumdoor-worker/src/motor-selection.ts`
 *   · route đã đăng ký  `server/apps-src/alumdoor-worker/src/index.ts:2676`
 *   · danh mục          `Ngưỡng chọn Motor` (doctype đã khai, đã có mục trên menu)
 * Nhưng KHÔNG một dòng nào bên client gọi `alumdoor.motor.suggest` (grep toàn
 * `client/packages/<package>/src` ngày 21/08/2026 ra 0 kết quả). Người bán vẫn chọn motor bằng trí nhớ,
 * đúng thứ mà chủ xưởng gọi là "chưa có phần ngưỡng chọn UPS".
 *
 * ── Panel này GỢI Ý, KHÔNG TỰ THÊM DÒNG HÀNG ────────────────────────────────────────────────
 * Bảng ngưỡng là luật của bảng giá có mộc, không phải mệnh lệnh: khách vẫn có quyền lấy motor
 * to hơn, và cửa siêu trường/đôi cánh có ngoại lệ mà bảng không mô tả. Nên panel chỉ hiện
 * "gợi ý + vì sao", còn việc thêm dòng hàng phải do người bán bấm `onAccept`.
 *
 * ── Khi bảng ngưỡng RỖNG ────────────────────────────────────────────────────────────────────
 * Máy chủ trả `{ motor: null, ups: null, note: "Chưa có bảng ngưỡng chọn Motor" }`. Đo D1 local
 * ngày 21/08/2026: `documents` doctype `Ngưỡng chọn Motor` có **0 bản ghi** (17 bản ghi mẫu nằm
 * trong `server/briefs/alumdoor-v2.json` nhưng chưa forge vào tenant). Panel hiện thẳng câu đó
 * kèm đường dẫn danh mục, KHÔNG bịa một mã motor để lấp chỗ trống.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BatteryCharging, Check, Cog, Loader2 } from "lucide-react";
import { Badge, Button } from "@metaforge/ui";
import { useMetaForge } from "@metaforge/views/provider";

export interface MotorSuggestion {
  rule_code: string;
  item_code: string;
  threshold: number;
  includes: string;
}

export interface MotorSuggestResult {
  motor: MotorSuggestion | null;
  ups: MotorSuggestion | null;
  motor_kg?: number;
  note?: string;
}

export interface AlumdoorMotorSuggestPanelProps {
  /** Diện tích cửa (m²) của dòng bán đang mở. Rỗng/0 thì panel im lặng. */
  areaSqm: number | null | undefined;
  /** Mã motor người bán ĐANG chọn, để panel nói rõ "đang chọn khác gợi ý". */
  currentMotorItemCode?: string;
  /** Mã bình lưu điện người bán đang chọn. */
  currentUpsItemCode?: string;
  disabled?: boolean;
  /**
   * Người bán bấm "Dùng gợi ý này". `kind` cho phép màn gọi biết đang chấp nhận motor hay UPS.
   * Không truyền `onAccept` thì panel chỉ hiển thị, không có nút — vẫn hợp lệ.
   */
  onAccept?: (kind: "motor" | "ups", suggestion: MotorSuggestion) => void;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Số đo hiện ra cho NGƯỜI BÁN, không phải cho máy.
 *
 * `billable_area_sqm` là tích của hai số thập phân (3,2 × 2,8), nên IEEE-754 trả về
 * 8.959999999999999. In thẳng ra câu "vì cửa 8.959999999999999 m² < ngưỡng 15 m²" là đưa rác
 * dấu phẩy động vào mặt khách. Làm tròn 2 chữ số — đúng độ chính xác mà bảng ngưỡng dùng —
 * rồi định dạng theo vi-VN cho khớp mọi con số khác trên màn.
 */
function measure(value: number): string {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

function SuggestionRow({
  kind,
  suggestion,
  reason,
  current,
  disabled,
  onAccept,
}: {
  kind: "motor" | "ups";
  suggestion: MotorSuggestion;
  reason: string;
  current?: string;
  disabled?: boolean;
  onAccept?: (kind: "motor" | "ups", suggestion: MotorSuggestion) => void;
}) {
  const Icon = kind === "motor" ? Cog : BatteryCharging;
  const matched = Boolean(current) && current === suggestion.item_code;
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border p-2.5 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">Gợi ý: {suggestion.item_code || suggestion.rule_code}</span>
          {suggestion.includes ? <Badge variant="secondary">{suggestion.includes}</Badge> : null}
          {matched ? (
            <Badge variant="outline" className="gap-1">
              <Check className="h-3 w-3" /> đang chọn đúng
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 text-muted-foreground">vì {reason}</div>
        {current && !matched ? (
          <div className="mt-0.5 text-amber-600 dark:text-amber-400">
            Đang chọn <span className="font-medium">{current}</span> — khác gợi ý. Gợi ý không bắt buộc; giữ nguyên nếu khách yêu cầu.
          </div>
        ) : null}
      </div>
      {onAccept ? (
        <Button
          type="button"
          size="sm"
          variant={matched ? "outline" : "secondary"}
          disabled={disabled || matched}
          onClick={() => onAccept(kind, suggestion)}
        >
          Dùng gợi ý này
        </Button>
      ) : null}
    </div>
  );
}

export function AlumdoorMotorSuggestPanel({
  areaSqm,
  currentMotorItemCode,
  currentUpsItemCode,
  disabled,
  onAccept,
}: AlumdoorMotorSuggestPanelProps) {
  const { adapter } = useMetaForge();
  const [result, setResult] = useState<MotorSuggestResult | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const clock = useRef(0);

  const area = num(areaSqm);

  useEffect(() => {
    if (area === null || area <= 0) {
      setResult(null);
      setError("");
      return;
    }
    const seq = ++clock.current;
    let cancelled = false;
    // Người bán gõ số đo từng ký tự; gọi mỗi ký tự là gọi thừa. 250ms là đủ để dừng gõ.
    const timer = setTimeout(() => {
      setPending(true);
      adapter
        .callPost<MotorSuggestResult>("alumdoor.motor.suggest", { area_sqm: area })
        .then((value) => {
          if (cancelled || clock.current !== seq) return;
          setResult(value);
          setError("");
        })
        .catch((caught: unknown) => {
          if (cancelled || clock.current !== seq) return;
          setResult(null);
          setError(caught instanceof Error ? caught.message : String(caught));
        })
        .finally(() => {
          if (cancelled || clock.current !== seq) return;
          setPending(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [adapter, area]);

  if (area === null || area <= 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Gợi ý motor / bình lưu điện
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Không tra được bảng ngưỡng: {error}</span>
        </div>
      ) : null}

      {result?.motor ? (
        <SuggestionRow
          kind="motor"
          suggestion={result.motor}
          reason={`cửa ${measure(area)} m² < ngưỡng ${measure(result.motor.threshold)} m² của ${result.motor.rule_code}`}
          current={currentMotorItemCode}
          disabled={disabled}
          onAccept={onAccept}
        />
      ) : null}

      {result?.ups ? (
        <SuggestionRow
          kind="ups"
          suggestion={result.ups}
          reason={`tải motor ${result.motor_kg === undefined || result.motor_kg === null ? "?" : measure(result.motor_kg)} kg < ngưỡng ${measure(result.ups.threshold)} kg của ${result.ups.rule_code} (UPS chọn theo TẢI MOTOR, không theo diện tích)`}
          current={currentUpsItemCode}
          disabled={disabled}
          onAccept={onAccept}
        />
      ) : null}

      {result && !result.motor ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50/50 p-2.5 text-sm dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <div>{result.note || `Không có motor nào cho cửa ${measure(area)} m².`}</div>
            <div className="mt-0.5 text-muted-foreground">
              Mở danh mục <span className="font-medium">Ngưỡng chọn Motor</span> để khai bảng tra. Hệ thống không tự đoán mã motor.
            </div>
          </div>
        </div>
      ) : null}

      {result?.motor && !result.ups ? (
        <div className="rounded-md border p-2.5 text-sm text-muted-foreground">
          Chưa có dòng bình lưu điện nào phủ tải {result.motor_kg ?? "?"} kg trong danh mục{" "}
          <span className="font-medium">Ngưỡng chọn Motor</span> (dòng có <code>selection_basis = "Tải motor"</code>).
        </div>
      ) : null}
    </div>
  );
}
