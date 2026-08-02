/**
 * registerDefaultControls — nạp control P0 vào registry theo fieldtype.
 * Fieldtype chưa có control chuyên biệt: FormView tự fallback (registry.resolve trả undefined
 * → dùng FallbackControl). missing() cho biết còn thiếu gì trước Cổng 6.
 */
import { createElement } from "react";
import type { Fieldtype } from "@metaforge/core";
import { ControlRegistry, type FieldControl, type FieldControlProps } from "./index.js";
import {
  TextControl,
  TextAreaControl,
  NumberControl,
  DurationControl,
  CheckControl,
  SelectControl,
  DateControl,
  ColorControl,
  ReadOnlyControl,
  LinkControl,
} from "./controls.js";
import {
  AttachControl,
  ImageControl,
  SignatureControl,
  BarcodeControl,
  GeolocationControl,
} from "./media.js";

/**
 * Precision trong metadata là GIỚI HẠN nghiệp vụ, không có nghĩa UI phải đệm đủ số 0.
 * Ví dụ qty=22 với precision=6 nên hiện "22", còn 0.389 vẫn phải giữ đủ ba số lẻ.
 * Chỉ thu gọn precision TRÌNH BÀY; giá trị gửi về form/server không thay đổi.
 */
function compactDisplayPrecision(value: unknown, rawPrecision: unknown): string | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return rawPrecision === undefined || rawPrecision === null || rawPrecision === ""
      ? undefined
      : String(rawPrecision);
  }

  // Nhiều field Float/Percent từ ERP không khai báo precision nhưng API vẫn trả chuỗi fixed-scale
  // như "22.000000". Nếu để precision undefined, GroupedNumberInput giữ nguyên chuỗi đó và UI
  // phơi toàn bộ số 0 thừa. Suy ra precision HIỂN THỊ trực tiếp từ phần lẻ thực tế của giá trị.
  if (rawPrecision === undefined || rawPrecision === null || rawPrecision === "") {
    const raw = String(value).trim();
    const match = raw.match(/^[+-]?\d+(?:\.(\d+))?$/);
    if (!match) return undefined;
    const fraction = (match[1] ?? "").replace(/0+$/, "");
    return String(fraction.length);
  }

  const original = String(rawPrecision);
  const precision = Number(original);
  if (!Number.isInteger(precision) || precision < 0) return original;
  if (precision === 0) return "0";
  const fraction = Math.abs(numeric).toFixed(precision).split(".")[1]?.replace(/0+$/, "") ?? "";
  return String(fraction.length);
}

const CompactNumberControl: FieldControl = (props: FieldControlProps) => {
  const precision = compactDisplayPrecision(props.value, props.field.precision);
  if (precision === props.field.precision) return createElement(NumberControl, props);
  return createElement(NumberControl, {
    ...props,
    field: { ...props.field, precision },
  });
};

/** Ánh xạ fieldtype → control (P0). */
export const DEFAULT_CONTROL_MAP: Partial<Record<Fieldtype, FieldControl>> = {
  // text 1 dòng
  Data: TextControl,
  Password: TextControl,
  Phone: TextControl,
  Autocomplete: TextControl,
  // text nhiều dòng
  "Small Text": TextAreaControl,
  Text: TextAreaControl,
  "Long Text": TextAreaControl,
  Code: TextAreaControl,
  JSON: TextAreaControl,
  "Markdown Editor": TextAreaControl,
  "HTML Editor": TextAreaControl,
  "Text Editor": TextAreaControl,
  // số
  Int: NumberControl,
  Float: CompactNumberControl,
  Currency: CompactNumberControl,
  Percent: CompactNumberControl,
  Rating: CompactNumberControl,
  Duration: DurationControl,
  // chọn
  Check: CheckControl,
  Select: SelectControl,
  Link: LinkControl,
  "Dynamic Link": LinkControl,
  // ngày giờ
  Date: DateControl,
  Datetime: DateControl,
  Time: DateControl,
  // media
  Attach: AttachControl,
  "Attach Image": AttachControl,
  Image: ImageControl,
  Signature: SignatureControl,
  Barcode: BarcodeControl,
  Geolocation: GeolocationControl,
  // khác
  Color: ColorControl,
  Icon: TextControl,
  "Read Only": ReadOnlyControl,
};

export function registerDefaultControls(registry: ControlRegistry): ControlRegistry {
  for (const [ft, control] of Object.entries(DEFAULT_CONTROL_MAP)) {
    if (control) registry.register(ft as Fieldtype, control);
  }
  return registry;
}

/** Registry đã nạp sẵn control mặc định (tiện dùng ngay). */
export function createDefaultRegistry(): ControlRegistry {
  return registerDefaultControls(new ControlRegistry());
}
