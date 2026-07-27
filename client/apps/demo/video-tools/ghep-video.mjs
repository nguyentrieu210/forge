/**
 * Ghép các clip đã quay + file giọng đọc thành MỘT video hoàn chỉnh.
 *
 * Cách chia thời lượng: mỗi đoạn lời đọc chiếm bao nhiêu TỪ thì cảnh tương ứng được bấy nhiêu
 * giây, tính theo tổng độ dài file audio thật. Chia đều mỗi cảnh một khoảng bằng nhau thì hình
 * và tiếng lệch nhau ngay từ giữa video — đang nói về báo cáo mà màn hình đã sang phân quyền.
 *
 * Chạy: node ghep-video.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";

const FF = "C:/Users/Admin/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin";
const CLIP = "C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin/078a4bb0-9ba7-48c9-aa06-0e98597c8160/scratchpad/video";
const TMP = `${CLIP}/ghep`;
const OUT = "C:/Users/Admin/Desktop/Video-gioi-thieu-kho";
const AUDIO = "C:/Users/Admin/Downloads/cuoi_thang_giam_doc_hoi_kho_con_bao_nhieu_hang_7cc7690d-fe11-4388-afe0-f43a5f16901c.mp3";
const FONT = "C\\:/Windows/Fonts/segoeui.ttf";
const NEN = "0x141719"; // nền thẻ chữ — xám rất tối, cùng tông với giao diện app
const W = 1600, H = 1000;

const ff = (args) => execFileSync(`${FF}/ffmpeg.exe`, ["-y", "-v", "error", ...args], { stdio: ["ignore", "pipe", "pipe"] });
const dai = (f) => Number(execFileSync(`${FF}/ffprobe.exe`,
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const tongAudio = dai(AUDIO);
console.log(`giọng đọc: ${tongAudio.toFixed(1)}s`);

/**
 * `tu` = số từ của đoạn lời đọc tương ứng. Thời lượng cảnh tính theo tỉ lệ số từ, nên đổi giọng
 * đọc (nhanh/chậm khác) thì chỉ cần chạy lại, không phải căn tay từng cảnh.
 */
const CUE = [
  { the: "mo", tu: 55 },
  { clip: "canh-2-tong-quan", tu: 32 },
  { clip: "canh-3-nhap-nhanh", tu: 55 },
  { clip: "canh-10-in-tem", tu: 35 },
  { clip: "canh-11-yeu-cau-vat-tu", tu: 55 },
  { clip: "canh-4-ton-kho", tu: 65 },
  { clip: "canh-15-ton-du-kien", tu: 33 },
  { clip: "canh-12-lo-han-dung", tu: 45 },
  { clip: "canh-13-kiem-ke", tu: 55 },
  { clip: "canh-5-bao-cao", tu: 75 },
  { clip: "canh-6-nhap-excel", tu: 60 },
  { clip: "canh-7-phan-quyen", tu: 110 },
  { clip: "canh-8-dien-thoai", tu: 55 },
  { clip: "canh-14-thiet-lap", tu: 50 },
  { clip: "canh-2-tong-quan", tu: 30 },
  { the: "ket", tu: 40 },
];
const tongTu = CUE.reduce((s, c) => s + c.tu, 0);
CUE.forEach((c) => { c.giay = +(tongAudio * c.tu / tongTu).toFixed(2); });

// ── thẻ chữ đầu và cuối ─────────────────────────────────────────────────────
// Dùng textfile chứ không nhét chữ thẳng vào filter: tiếng Việt có dấu cộng với dấu nháy, dấu
// phẩy trong bộ lọc ffmpeg là một mớ escape rất dễ sai mà lỗi lại im lặng (chữ mất, không báo).
function theChu(ten, giay, dong) {
  const lop = dong.map((d, i) => {
    const tf = `${TMP}/chu-${ten}-${i}.txt`;
    writeFileSync(tf, d.chu, "utf8");
    return `drawtext=fontfile='${FONT}':textfile='${tf.replace(/:/g, "\\:")}'`
      + `:fontsize=${d.co}:fontcolor=${d.mau}:x=(w-text_w)/2:y=${d.y}`;
  }).join(",");
  const f = `${TMP}/the-${ten}.mp4`;
  ff(["-f", "lavfi", "-i", `color=c=${NEN}:s=${W}x${H}:d=${giay}:r=30`,
    "-vf", lop, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", f]);
  return f;
}

// ── chuẩn hoá từng cảnh về đúng khung hình và đúng thời lượng ───────────────
function doanPhim(ten, giay, i) {
  const nguon = `${CLIP}/${ten}.webm`;
  if (!existsSync(nguon)) throw new Error(`thiếu clip ${nguon}`);
  const goc = dai(nguon);
  const f = `${TMP}/doan-${String(i).padStart(2, "0")}.mp4`;
  // Clip điện thoại quay khung dọc 430px — không kéo dãn cho đầy màn hình (chữ sẽ nhoè và sai tỉ
  // lệ), mà đặt nguyên vào giữa nền tối, trông như đang cầm điện thoại lên xem.
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,`
    + `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${NEN},setsar=1,fps=30`;
  const args = goc >= giay
    ? ["-i", nguon, "-t", String(giay), "-vf", vf]
    // ngắn hơn phần lời đọc thì cho chạy lặp lại cho đủ, còn hơn để hình đứng im
    : ["-stream_loop", "-1", "-i", nguon, "-t", String(giay), "-vf", vf];
  ff([...args, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", f]);
  return f;
}

const cacDoan = [];
CUE.forEach((c, i) => {
  let f;
  if (c.the === "mo") {
    f = theChu("mo", c.giay, [
      { chu: "Kho còn bao nhiêu hàng?", co: 96, mau: "white", y: "(h-text_h)/2-70" },
      { chu: "Câu hỏi mà mỗi người trong công ty trả lời một kiểu", co: 40, mau: "0xA8ADB2", y: "(h-text_h)/2+70" },
    ]);
  } else if (c.the === "ket") {
    f = theChu("ket", c.giay, [
      { chu: "Demo miễn phí trên số liệu của bạn", co: 44, mau: "0xA8ADB2", y: "(h-text_h)/2-150" },
      { chu: "0369 831 584", co: 120, mau: "0xF2B705", y: "(h-text_h)/2-20" },
      { chu: "Gọi hoặc nhắn Zalo", co: 40, mau: "white", y: "(h-text_h)/2+130" },
    ]);
  } else {
    f = doanPhim(c.clip, c.giay, i);
  }
  cacDoan.push(f);
  console.log(`  ${String(i + 1).padStart(2)}. ${(c.clip ?? "thẻ " + c.the).padEnd(24)} ${c.giay.toFixed(1)}s`);
});

// ── nối lại rồi lồng tiếng ──────────────────────────────────────────────────
const ds = `${TMP}/danh-sach.txt`;
writeFileSync(ds, cacDoan.map((f) => `file '${f}'`).join("\n"), "utf8");
const cauHinh = `${TMP}/noi.mp4`;
ff(["-f", "concat", "-safe", "0", "-i", ds, "-c", "copy", cauHinh]);

/**
 * CHUẨN HOÁ ÂM LƯỢNG trước khi lồng vào phim.
 *
 * File giọng đọc do công cụ AI xuất ra thường rất nhỏ — bản này đo được -22,9 LUFS, trong khi
 * chuẩn của mạng xã hội là quanh -14. Chênh 9 dB nghĩa là người xem phải vặn to gấp đôi mới nghe
 * rõ, mà phần lớn sẽ lướt qua chứ không vặn.
 *
 * Đo trước rồi mới chỉnh (hai lượt) chứ không tăng đại một mức cố định: tăng thẳng 9 dB thì đỉnh
 * tín hiệu vượt ngưỡng và tiếng bị rè ở những chỗ đọc mạnh.
 */
function chuanHoaTieng(nguon) {
  const ra = `${TMP}/am-chuan.m4a`;
  const doc = execFileSync(`${FF}/ffmpeg.exe`,
    ["-hide_banner", "-i", nguon, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
    { stdio: ["ignore", "pipe", "pipe"] });
  const json = JSON.parse((doc.toString() + "").slice((doc.toString() + "").lastIndexOf("{")).trim()
    .replace(/[\s\S]*?(\{[\s\S]*\})[\s\S]*/, "$1"));
  const m = `measured_I=${json.input_i}:measured_TP=${json.input_tp}`
    + `:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}`;
  console.log(`  âm gốc ${json.input_i} LUFS → kéo về -14`);
  ff(["-i", nguon, "-af", `loudnorm=I=-14:TP=-1.5:LRA=11:${m}:linear=true`,
    "-ar", "48000", "-c:a", "aac", "-b:a", "192k", ra]);
  return ra;
}

const amThanh = chuanHoaTieng(AUDIO);
const ngang = `${OUT}/VIDEO-HOAN-CHINH-ngang.mp4`;
// -shortest cắt theo luồng NGẮN HƠN. Đã một lần lồng nhầm file giọng đọc ngắn hơn và cả video bị
// cắt cụt còn 90 giây mà không có cảnh báo nào — nên kiểm độ dài hai luồng trước khi ghép.
const dAm = dai(amThanh), dHinh = dai(cauHinh);
if (Math.abs(dAm - dHinh) > 3) {
  throw new Error(`hình ${dHinh.toFixed(1)}s và tiếng ${dAm.toFixed(1)}s lệch nhau quá nhiều — kiểm lại file giọng đọc`);
}
ff(["-i", cauHinh, "-i", amThanh, "-map", "0:v", "-map", "1:a",
  "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", ngang]);

// Bản khung DỌC 4:5 cho Facebook: đặt nguyên hình ngang vào giữa, chừa nền trên dưới. Cắt sát
// vào giữa thì mất cột số liệu hai bên — mà số liệu chính là thứ cần khoe.
const doc = `${OUT}/VIDEO-HOAN-CHINH-facebook-4x5.mp4`;
ff(["-i", ngang, "-vf", `scale=1080:-2,pad=1080:1350:0:(oh-ih)/2:color=${NEN},setsar=1`,
  "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
  "-c:a", "copy", "-movflags", "+faststart", doc]);

for (const f of [ngang, doc]) {
  console.log(`\n${f.split("/").pop()}  ${dai(f).toFixed(1)}s`);
}
console.log("\nxong");
