/**
 * registerDefaultControls — nạp control P0 vào registry theo fieldtype.
 * Fieldtype chưa có control chuyên biệt: FormView tự fallback (registry.resolve trả undefined
 * → dùng FallbackControl). missing() cho biết còn thiếu gì trước Cổng 6.
 */
import type { Fieldtype } from "@metaforge/core";
import { ControlRegistry, type FieldControl } from "./index.js";
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
  Float: NumberControl,
  Currency: NumberControl,
  Percent: NumberControl,
  Rating: NumberControl,
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
