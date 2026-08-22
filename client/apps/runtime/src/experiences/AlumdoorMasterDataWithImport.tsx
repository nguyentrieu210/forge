import {
  AlumdoorMasterDataScreen,
  type AlumdoorMasterItem,
  type AlumdoorMasterReadiness,
} from "./AlumdoorMasterDataScreen.js";

/**
 * Bản bọc của màn Danh mục. Nó nằm giữa nơi gắn và màn thật, nên MỌI prop mới phải đi qua đây.
 *
 * ĐƯỜNG GẮN LÀ BA CHẶNG, KHÔNG PHẢI MỘT:
 *   `main-base.tsx:26` nhập `AlumdoorMasterDataScreen` từ `./experience-registry.js`
 *   → `experience-registry.tsx:10` khai tên đó là `lazy(() => import("./AlumdoorMasterDataWithImport.js"))`
 *   → file này chuyển tiếp xuống `AlumdoorMasterDataScreen` thật.
 *
 * Tức JSX ở `main-base.tsx:913` KHÔNG dựng màn thật mà dựng bản bọc này. Một bản bàn giao trước
 * ghi "nơi gọi duy nhất là main-base.tsx:913" — sai hai lần: `grep -rn AlumdoorMasterDataScreen
 * client --include=*.tsx` ra 4 file, và nơi gọi màn thật là dòng dưới đây. Hệ quả đo được: thêm
 * `readiness={…}` ở main-base khi Props ở đây chưa khai nó thì tsc strict báo
 * `TS2322: Property 'readiness' does not exist on type 'Props'` và biên dịch dừng; ép qua bằng
 * cast thì bản bọc NUỐT IM LẶNG số đo và màn vẫn in "Chưa có số liệu tình trạng dữ liệu".
 *
 * Prop `readiness` khai ở đây nên cả ba chặng đã thông: từ 2026-08-19 `main-base.tsx` gọi
 * `alumdoor.catalog.readiness` (worker Alumdoor, đọc-chỉ — `server/apps-src/alumdoor-worker/
 * src/catalog-readiness.ts`) rồi truyền thẳng xuống đây.
 *
 * Gọi hỏng / chưa cài worker thì `readiness` là `undefined` và màn nói thẳng là chưa đo — KHÔNG
 * bao giờ là `{}`: map rỗng cho ra blocked=0, partial=0 và màn tuyên bố cả chuỗi đã thông sau 0
 * phép đo.
 */
interface Props {
  items: AlumdoorMasterItem[];
  onNavigate: (route: string) => void;
  readiness?: AlumdoorMasterReadiness;
  readinessStatus?: "idle" | "loading" | "success" | "error";
  readinessError?: string;
  onRetryReadiness?: () => void;
}

export function AlumdoorMasterDataWithImport({
  items,
  onNavigate,
  readiness,
  readinessStatus,
  readinessError,
  onRetryReadiness,
}: Props) {
  return (
    <AlumdoorMasterDataScreen
      items={items}
      onNavigate={onNavigate}
      readiness={readiness}
      readinessStatus={readinessStatus}
      readinessError={readinessError}
      onRetryReadiness={onRetryReadiness}
    />
  );
}
