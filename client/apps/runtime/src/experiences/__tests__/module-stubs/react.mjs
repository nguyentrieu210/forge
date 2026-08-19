/**
 * React tối thiểu để nạp được MỘT màn hình, không phải để dựng lại React.
 *
 * `useMemo` ở đây gọi thẳng hàm và bỏ mảng phụ thuộc. Test chỉ soi hàm thuần
 * (`resolveEntryStatus`, `resolveMasterGroups`, `summarizeChain`) nên không cần bộ nhớ hoá —
 * và nếu giả lập cache ở đây thì kết quả test sẽ phụ thuộc vào bản giả lập chứ không phải
 * vào mã đang kiểm.
 */
export const useMemo = (factory) => factory();
export const useState = (initial) => [initial, () => {}];
export const useEffect = () => {};
export const useCallback = (fn) => fn;
export const useRef = (initial) => ({ current: initial });
export const Fragment = Symbol.for("react.fragment");
export const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
export default { useMemo, useState, useEffect, useCallback, useRef, Fragment, createElement };
