/**
 * `jsx-runtime` giả: trả về cây mô tả thuần, không render ra DOM.
 *
 * Đủ để gọi được component và soi cấu trúc trả về. Không dùng react-dom vì repo chưa cài
 * node_modules cho client, và kéo cả bộ render vào chỉ để đếm nhãn là đổi một test nhanh lấy
 * một test giòn.
 */
export const Fragment = Symbol.for("react.fragment");
export const jsx = (type, props, key) => ({ type, props, key });
export const jsxs = jsx;
export const jsxDEV = jsx;
