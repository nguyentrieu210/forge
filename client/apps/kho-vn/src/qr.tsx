/** @jsxImportSource react */
/**
 * Mã QR + mã vạch, vẽ hoàn toàn TẠI MÁY.
 *
 * Không gọi dịch vụ sinh ảnh QR ngoài (api.qrserver.com, chart.googleapis.com…): app này chạy
 * trong kho, có nơi mạng nội bộ không ra Internet, và tem là thứ phải in được kể cả lúc rớt mạng.
 * Gửi mã hàng của khách sang máy chủ bên thứ ba cũng là chuyện không nên làm.
 *
 * Vẽ ra SVG chứ không phải <canvas>: SVG là vector nên in ở bất kỳ độ phân giải nào cũng sắc nét
 * — quan trọng với tem, vì máy quét đọc kém hẳn khi mép ô bị răng cưa.
 */
import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** Mã QR dạng SVG. `size` tính bằng px của khung vẽ cuối cùng. */
export function QrCode({ value, size = 96, className }: { value: string; size?: number; className?: string }) {
  const path = useMemo(() => {
    if (!value) return null;
    // typeNumber 0 = tự chọn phiên bản nhỏ nhất đủ chứa. Mức sửa lỗi M (~15%): tem dán trên
    // thùng hàng hay bị xước/bụi, L thì đọc hỏng, Q/H thì ô dày lên mà không cần thiết.
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { d, n };
  }, [value]);

  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.n} ${path.n}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR ${value}`}
    >
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  );
}

/**
 * Mã vạch Code 128 (bộ B) dạng SVG.
 *
 * Vì sao cần cả mã vạch bên cạnh QR: rất nhiều kho đang dùng máy quét laser đời cũ chỉ đọc được
 * mã vạch một chiều, không đọc QR. In cả hai thì tem dùng được với mọi loại máy đang có.
 *
 * Code 128B chứa được chữ hoa/thường/số — hợp với mã hàng kiểu "SP-001-A" mà EAN-13 (chỉ số, và
 * bắt buộc đúng 13 chữ số) không mã hoá nổi.
 */
const CODE128_PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100",
  "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100",
  "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110",
  "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110",
  "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010",
  "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110",
  "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000",
  "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010",
  "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100",
  "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110",
  "11110101110", "11010000100", "11010010000", "11010011100", "11000111010",
];
const CODE128_STOP = "1100011101011";

export function Barcode128({ value, width = 200, height = 44, className }: {
  value: string; width?: number; height?: number; className?: string;
}) {
  const bits = useMemo(() => {
    if (!value) return null;
    // Code 128B mã hoá được ASCII 32..126. Ký tự ngoài dải đó (dấu tiếng Việt chẳng hạn) không
    // biểu diễn được — bỏ tem mã vạch còn hơn in ra một mã sai mà máy quét đọc thành thứ khác.
    if (![...value].every((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126)) return null;

    const codes = [104]; // Start B
    for (const ch of value) codes.push(ch.charCodeAt(0) - 32);
    // Ký tự kiểm: (start + Σ vị_trí×giá_trị) mod 103
    let sum = 104;
    for (let i = 1; i < codes.length; i++) sum += codes[i]! * i;
    codes.push(sum % 103);

    let s = "";
    for (const c of codes) s += CODE128_PATTERNS[c] ?? "";
    return s + CODE128_STOP;
  }, [value]);

  if (!bits) return null;
  const unit = width / bits.length;
  const bars: Array<{ x: number; w: number }> = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      bars.push({ x: i * unit, w: (j - i) * unit });
      i = j;
    } else i++;
  }
  return (
    <svg width={width} height={height} className={className} shapeRendering="crispEdges" role="img" aria-label={`Mã vạch ${value}`}>
      <rect width={width} height={height} fill="#fff" />
      {bars.map((b, k) => <rect key={k} x={b.x} y={0} width={b.w} height={height} fill="#000" />)}
    </svg>
  );
}
