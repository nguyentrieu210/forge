/** Narrow dependency surface for stock/accounting reports. */
export { useMetaForge, useLocaleFormat } from "./container/meta-context.js";
export { useList } from "./container/hooks.js";
export { resolveDateRange } from "./list/date-range.js";
export { PeriodPicker, type PeriodPickerProps } from "./report/PeriodPicker.js";
export { exportFormXlsx, ymdToDmy, type FormXlsxOptions, type HeaderMerge } from "./report/form-export.js";
