/**
 * Tạo PDF thật ở trình duyệt từ đúng HTML bản in.
 *
 * Hai thư viện nặng được nạp động chỉ khi người dùng bấm "Tải PDF". HTML được
 * dựng trong iframe không cho chạy script; sau đó chụp theo từng trang A4 để
 * giữ nguyên font tiếng Việt, logo, màu và đường kẻ của mẫu in.
 */
export async function downloadPrintPdf(html: string, filename: string): Promise<void> {
  const landscape = /@page\s*\{[^}]*size\s*:\s*A4\s+landscape/i.test(html);
  const pageWidthMm = landscape ? 297 : 210;
  const pageHeightMm = landscape ? 210 : 297;
  const pageWidthPx = Math.round((pageWidthMm / 25.4) * 96);
  const pageHeightPx = Math.round((pageHeightMm / 25.4) * 96);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-same-origin");
  Object.assign(frame.style, {
    position: "fixed",
    left: "-12000px",
    top: "0",
    width: `${pageWidthPx}px`,
    height: `${pageHeightPx}px`,
    border: "0",
    pointerEvents: "none",
  });
  frame.srcdoc = html;
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Bản in tải quá lâu")), 10_000);
      frame.addEventListener("load", () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
    });

    const printDocument = frame.contentDocument;
    if (!printDocument?.body) throw new Error("Không đọc được nội dung bản in");
    await printDocument.fonts?.ready;
    await Promise.all(
      Array.from(printDocument.images).map(async (image) => {
        if (image.complete) return;
        try { await image.decode(); } catch { /* ảnh lỗi sẽ hiện placeholder trong PDF */ }
      }),
    );

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const measuredHeight = Math.max(printDocument.body.scrollHeight, printDocument.documentElement.scrollHeight);
    // A4 297 mm quy đổi 96 dpi ra 1122,52 px rồi làm tròn thành 1123 px. Trình duyệt đôi lúc
    // báo scrollHeight dư 1–2 px do làm tròn font/đường viền; nếu giữ phần dư giả này, jsPDF
    // tạo thêm một trang trắng chỉ cao vài pixel. Chỉ coi là trang tiếp theo khi thực sự tràn.
    const contentHeight = measuredHeight <= pageHeightPx + 2 ? pageHeightPx : measuredHeight;
    const canvas = await html2canvas(printDocument.body, {
      backgroundColor: "#ffffff",
      logging: false,
      scale: 2,
      useCORS: true,
      width: pageWidthPx,
      height: contentHeight,
      windowWidth: pageWidthPx,
      windowHeight: contentHeight,
    });

    const pdf = new jsPDF({
      orientation: landscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    const pixelsPerPage = Math.max(1, Math.floor(canvas.width * pageHeightMm / pageWidthMm));
    let offset = 0;
    let page = 0;
    while (offset < canvas.height) {
      const sliceHeight = Math.min(pixelsPerPage, canvas.height - offset);
      if (page > 0 && sliceHeight <= 4) break;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext("2d");
      if (!context) throw new Error("Không tạo được trang PDF");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (page > 0) pdf.addPage("a4", landscape ? "landscape" : "portrait");
      pdf.addImage(
        slice.toDataURL("image/png"),
        "PNG",
        0,
        0,
        pageWidthMm,
        pageWidthMm * sliceHeight / canvas.width,
        undefined,
        "MEDIUM",
      );
      offset += sliceHeight;
      page += 1;
    }
    pdf.save(filename.toLocaleLowerCase("vi").endsWith(".pdf") ? filename : `${filename}.pdf`);
  } finally {
    frame.remove();
  }
}
