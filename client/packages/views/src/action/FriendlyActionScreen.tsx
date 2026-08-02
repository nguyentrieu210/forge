/** @jsxImportSource react */
import type { AppAction, AppActionField } from "@metaforge/core";
import { ActionScreen as BaseActionScreen, type ActionScreenProps } from "./ActionScreen.js";

const FIFO_RECEIPT_ACTION = "nhap-nhom-fifo";

const FIFO_FIELD_ORDER = [
  "supplier",
  "supplier_invoice_no",
  "driver",
  "item_code",
  "length_m",
  "qty_bar",
  "actual_weight_kg",
  "rate",
  "color",
  "is_stamped",
  "warehouse",
] as const;

const FIFO_FIELD_COPY: Record<string, Pick<AppActionField, "label" | "description">> = {
  supplier: {
    label: "Nhà cung cấp",
    description: "Chọn nhà máy đang giao hàng, ví dụ Tiến Đạt.",
  },
  supplier_invoice_no: {
    label: "Số phiếu giao hàng",
    description: "Ghi đúng số trên phiếu giao của nhà cung cấp để tra lại lịch sử sau này.",
  },
  driver: {
    label: "Người giao / lái xe",
    description: "Không bắt buộc. Dùng để đối chiếu khi cần.",
  },
  item_code: {
    label: "Mã nhôm",
    description: "Chọn đúng mã đang nhận thực tế, ví dụ AL71.",
  },
  length_m: {
    label: "Chiều dài mỗi cây (m)",
    description: "Ví dụ 7,2 m. Đây là chiều dài một cây, không phải tổng số mét.",
  },
  qty_bar: {
    label: "Số cây thực nhận",
    description: "Nhập số cây đếm được khi hàng về. Hệ thống sẽ tự trừ vào đơn mua cũ nhất trước.",
  },
  actual_weight_kg: {
    label: "Tổng kg cân thực tế",
    description: "Nhập số kg cân thực tế của số cây vừa nhận, không nhập kg barem.",
  },
  rate: {
    label: "Đơn giá mua / kg",
    description: "Đơn giá dùng cho lô hàng đang nhận, theo đơn mua hoặc phiếu giao.",
  },
  color: {
    label: "Màu nhôm",
    description: "Màu phải khớp với đơn mua được phân bổ.",
  },
  is_stamped: {
    label: "Có dập chữ không?",
    description: "Chọn Có nếu cây nhôm có dập theo quy cách đơn mua; ngược lại chọn Không.",
  },
  warehouse: {
    label: "Kho nhận hàng",
    description: "Kho thực tế nhận số nhôm này.",
  },
};

function makeFriendlyField(field: AppActionField): AppActionField {
  const copy = FIFO_FIELD_COPY[field.fieldname];
  return copy ? { ...field, ...copy } : field;
}

function makeFriendlyFifoAction(action: AppAction): AppAction {
  if (action.name !== FIFO_RECEIPT_ACTION) return action;

  const byName = new Map(action.fields.map((field) => [field.fieldname, field]));
  const ordered = FIFO_FIELD_ORDER
    .map((fieldname) => byName.get(fieldname))
    .filter((field): field is AppActionField => Boolean(field))
    .map(makeFriendlyField);
  const included = new Set(ordered.map((field) => field.fieldname));
  const remaining = action.fields.filter((field) => !included.has(field.fieldname)).map(makeFriendlyField);

  return {
    ...action,
    label: "Nhận nhôm từ nhà cung cấp",
    description: "Chỉ nhập thông tin trên phiếu giao và số hàng đang có trước mặt. Không chọn đơn mua; hệ thống tự phân bổ số cây vào các đơn mua cũ nhất rồi tính phần còn nợ.",
    fields: [...ordered, ...remaining],
    preview: action.preview
      ? { ...action.preview, label: "Kiểm tra phân bổ theo đơn mua" }
      : action.preview,
    commit: {
      ...action.commit,
      label: "Tạo phiếu nhập",
      confirm: "Tạo phiếu nhập nháp từ số hàng thực nhận này? Hệ thống sẽ tự trừ các đơn mua cũ nhất trước.",
    },
  };
}

export function ActionScreen(props: ActionScreenProps) {
  if (props.action.name !== FIFO_RECEIPT_ACTION) return <BaseActionScreen {...props} />;

  const action = makeFriendlyFifoAction(props.action);
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4" data-friendly-fifo-receipt>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/25 px-4 py-4 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Mua hàng · Nhận hàng</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Nhận nhôm từ nhà cung cấp</h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
            Nhập đúng số hàng thực tế vừa nhận. Người dùng không cần chọn đơn mua cũ nào; hệ thống tự đối chiếu mã nhôm, quy cách, màu và dập rồi phân bổ vào đơn mua theo thứ tự ngày cũ nhất trước.
          </p>
        </div>
        <div className="grid gap-0 sm:grid-cols-3">
          <div className="border-b px-4 py-3 sm:border-b-0 sm:border-r">
            <div className="text-xs font-semibold text-primary">1 · Phiếu giao</div>
            <p className="mt-1 text-sm">NCC, số phiếu giao và người giao.</p>
          </div>
          <div className="border-b px-4 py-3 sm:border-b-0 sm:border-r">
            <div className="text-xs font-semibold text-primary">2 · Hàng thực nhận</div>
            <p className="mt-1 text-sm">Mã nhôm, chiều dài, số cây, kg cân, giá, màu và dập.</p>
          </div>
          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-primary">3 · Hệ thống tự trừ đơn</div>
            <p className="mt-1 text-sm">Xem đơn nào được trừ và công nợ giao hàng còn lại trước khi tạo phiếu nhập.</p>
          </div>
        </div>
      </section>

      <BaseActionScreen {...props} action={action} />
    </div>
  );
}

export type { ActionScreenProps } from "./ActionScreen.js";
