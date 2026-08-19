// Reporter dùng riêng cho nhánh refactor: in mỗi test một dòng JSON (file + tên + đậu/rớt).
// Mục đích: chụp ảnh trạng thái ĐỎ có sẵn để so sánh sau mỗi bước refactor,
// nhờ đó phân biệt được "lỗi vốn đã có" với "lỗi do refactor gây ra".
import path from "node:path";

export default async function* refactorBaselineReporter(source) {
  for await (const event of source) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const data = event.data;
    if (data.details?.type === "suite") continue;
    const file = data.file ? path.relative(process.cwd(), data.file).split(path.sep).join("/") : "unknown";
    yield `${JSON.stringify({ file, name: data.name, ok: event.type === "test:pass" })}\n`;
  }
}
