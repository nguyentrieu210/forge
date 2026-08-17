const clean = (value) => String(value ?? "").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/[Đ]/g, "D")
  .replace(/\s+/g, " ");

function containsAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function isAreaUom(sourceUom) {
  const key = fold(sourceUom).replace(/\s/g, "");
  return key === "M2" || key === "M²";
}

function finishedDoorGroup(category, code, name) {
  const text = `${fold(category)} | ${fold(code)} | ${fold(name)}`;
  if (containsAny(text, ["SIEU TRUONG", "SIEUTRUONG"])) return "Cửa Siêu Trường";
  if (containsAny(text, ["CUA LUOI", " LUOI ", "LUOI INOX", "LUOI MV"])) return "Cửa Lưới";
  if (containsAny(text, ["CUA KEO", "KEO DAI LOAN", "KEO DL"])) return "Cửa kéo Đài Loan";
  if (containsAny(text, ["DAI LOAN", "DAILoan", " DL "])) {
    if (containsAny(text, ["INOX", "I-NOX"])) return "Cửa Đài Loan Inox";
    return "Cửa Đài Loan";
  }
  if (containsAny(text, [" CUA UC", "| UC", " UC ", "TAM LIEN", "UC KT", "UC "])) return "Cửa tấm liền Úc";
  if (containsAny(text, [" DUC", "| DUC", "AL501", "AL503", "AL548", "AL552", "AL652", "AL752", "AL75", "AL70", "AL71", "AL595", "ALVIP", "VIPST"])) {
    return "Cửa CN Đức";
  }
  return "";
}

function motorGroup(category, code, name) {
  const text = `${fold(category)} | ${fold(code)} | ${fold(name)}`;
  if (containsAny(text, ["BINH LUU DIEN", "LUU DIEN", " UPS", "UPS-", "UPS_"])) return "Bình lưu điện";
  if (containsAny(text, ["REMOTE", "DIEU KHIEN", "BO DK", "TAY DK", "CONTROL", "PHOTOCELL", "CAM BIEN"])) {
    return "Điều khiển & phụ kiện điện";
  }
  if (containsAny(text, ["MOTOR", "MO TO", "ALUMAX", "YHLD", "YHTAIWAN", "TANKER", "AUSTDOOR"])) return "Motor";
  return "";
}

export function resolveAlumdoorRealSellableGroup({ category, item_code, item_name, source_uom } = {}) {
  const categoryText = fold(category);
  const code = fold(item_code);
  const name = fold(item_name);

  if (isAreaUom(source_uom)) {
    const finished = finishedDoorGroup(categoryText, code, name);
    if (finished) return finished;
  }

  const motor = motorGroup(categoryText, code, name);
  if (motor) return motor;

  if (containsAny(`${categoryText} | ${name}`, ["MOTOR", "MO TO"])) return "Linh kiện motor";
  if (containsAny(categoryText, ["DUC", "CN DUC"])) return "Phụ kiện CN Đức";
  if (containsAny(categoryText, ["LUOI"])) return "Phụ kiện chung";
  if (containsAny(categoryText, ["UC", "DAI LOAN", "DL", "SIEU TRUONG", "PHU KIEN"])) return "Phụ kiện chung";

  // Preserve fail-closed behavior for source categories not yet audited.
  return "";
}

export function resolveAlumdoorRealStockGroup({ category, item_code, item_name } = {}) {
  const categoryText = fold(category);
  const code = fold(item_code);
  const name = fold(item_name);
  const text = `${categoryText} | ${code} | ${name}`;

  if (containsAny(text, ["RAY", "TRUC", "TRỤC"])) return "Ray và trục";

  if (containsAny(text, [
    "MOTOR", "MO TO", "ALUMAX", "YHLD", "YHTAIWAN", "TANKER",
    "NHONG", "PHANH", "TU DIEN", "CUON DAY", "THAN MOTOR", "BO MACH",
  ])) return "Linh kiện motor";

  if (containsAny(text, [
    "NVL-AL", "TON-", "TOLE", "TÔN", " NAN ", "NAN/", "LA CUA", "LÁ CỬA",
    "AL50", "AL70", "AL71", "AL75", "AL595", "AL652", "AL752", "AL552",
    "AL501", "AL503", "AL548", "ALVIP", "VIPST",
  ])) return "Nan/lá cửa";

  if (containsAny(text, ["SON TINH DIEN", "SƠN TĨNH ĐIỆN", " STD", "-STD", "_STD"])) {
    return "Phụ kiện cần sơn tĩnh điện";
  }

  if (containsAny(categoryText, ["DUC", "CN DUC"])) return "Phụ kiện CN Đức";
  return "Phụ kiện chung";
}
