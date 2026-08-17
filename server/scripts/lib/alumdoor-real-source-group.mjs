const clean = (value) => String(value ?? "").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/[Đ]/g, "D")
  .replace(/\s+/g, " ");

const EXACT_GROUPS = Object.freeze({
  "TP-LACPHU33_1LO": "Linh kiện motor",
  "TP-LACPHU36_1LO": "Linh kiện motor",
  "TP-LACPHU33_3LO": "Linh kiện motor",
  "TP-LACPHU36_3LO": "Linh kiện motor",
  "TP-CHONGXOLO": "Phụ kiện chung",
  "CROMATE 3+": "Phụ kiện cần sơn tĩnh điện",
  "TẨY NHÔM": "Phụ kiện cần sơn tĩnh điện",
  "NVL-GOIFE": "Phụ kiện chung",
  "NVL-GIAT": "Phụ kiện chung",
  "NVL-CHNHUA": "Phụ kiện chung",
});

function exactGroup(code) {
  return EXACT_GROUPS[clean(code)] ?? "";
}

function containsAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function categoryIs(category, values) {
  const key = fold(category).replace(/[^A-Z0-9]+/g, " ").trim();
  return values.some((value) => key === value || key.startsWith(`${value} `));
}

function isAreaUom(sourceUom) {
  const key = fold(sourceUom).replace(/\s/g, "");
  return key === "M2" || key === "M²";
}

function finishedDoorGroup(category, code, name) {
  const categoryText = fold(category);
  const text = `${categoryText} | ${fold(code)} | ${fold(name)}`;
  if (categoryIs(categoryText, ["DUC", "CN DUC"])) return "Cửa CN Đức";
  if (categoryIs(categoryText, ["UC", "CUA UC"])) return "Cửa tấm liền Úc";
  if (categoryIs(categoryText, ["SIEU TRUONG"])) return "Cửa Siêu Trường";
  if (categoryIs(categoryText, ["LUOI", "CUA LUOI"])) return "Cửa Lưới";
  if (categoryIs(categoryText, ["DAI LOAN", "DL", "CUA DAI LOAN"])) {
    if (containsAny(text, ["INOX", "I-NOX"])) return "Cửa Đài Loan Inox";
    if (containsAny(text, ["CUA KEO", "KEO DAI LOAN", "KEO DL"])) return "Cửa kéo Đài Loan";
    return "Cửa Đài Loan";
  }
  if (containsAny(text, ["SIEU TRUONG", "SIEUTRUONG"])) return "Cửa Siêu Trường";
  if (containsAny(text, ["CUA LUOI", " LUOI ", "LUOI INOX", "LUOI MV"])) return "Cửa Lưới";
  if (containsAny(text, ["CUA KEO", "KEO DAI LOAN", "KEO DL"])) return "Cửa kéo Đài Loan";
  if (containsAny(text, ["DAI LOAN", "CUA DL"])) {
    if (containsAny(text, ["INOX", "I-NOX"])) return "Cửa Đài Loan Inox";
    return "Cửa Đài Loan";
  }
  if (containsAny(text, ["CUA UC", "TAM LIEN", "UC KT"])) return "Cửa tấm liền Úc";
  if (containsAny(text, ["CUA DUC", "AL501", "AL503", "AL548", "AL552", "AL652", "AL752", "AL75", "AL70", "AL71", "AL595", "ALVIP", "VIPST"])) return "Cửa CN Đức";
  return "";
}

function materialGroup(code, name) {
  const direct = exactGroup(code);
  if (direct) return direct;
  const text = `${fold(code)} | ${fold(name)}`;
  if (containsAny(text, ["RAY", "TRUC", "ONG KEM 34", "ONG KEM34"])) return "Ray và trục";
  if (containsAny(text, [
    "TP-A282", "TP-TD327", "TP-TD326", "TP-TD325", "NVL-AL", "TON-", "TOLE",
    " LA ", "LA DAU", "LA YEM", "LA DAY", "LA TRUNG GIAN", " NAN ", "NAN/",
    "AL50", "AL70", "AL71", "AL75", "AL595", "AL652", "AL752", "AL552",
    "AL501", "AL503", "AL548", "ALVIP", "VIPST",
  ])) return "Nan/lá cửa";
  return "";
}

function motorProductGroup(code, name) {
  const direct = exactGroup(code);
  if (direct) return direct;
  const text = `${fold(code)} | ${fold(name)}`;
  if (containsAny(text, ["BINH LUU DIEN", "LUU DIEN", " UPS", "UPS-", "UPS_"])) return "Bình lưu điện";
  if (containsAny(text, ["REMOTE", "DIEU KHIEN", "BO DK", "TAY DK", "CONTROL", "PHOTOCELL", "CAM BIEN"])) return "Điều khiển & phụ kiện điện";
  if (containsAny(text, ["MOTOR", "MO TO", "TP-MT-"])) return "Motor";
  return "";
}

function motorComponentGroup(category, code, name) {
  const direct = exactGroup(code);
  if (direct) return direct;
  const text = `${fold(code)} | ${fold(name)}`;
  const branded = containsAny(text, ["ALUMAX", "YHLD", "YHTAIWAN", "TANKER", "J.G", "JG-"]);
  const component = containsAny(text, [
    "PAT", "LAC", "THAN", "NHONG", "PHANH", "TU DIEN", "CUON DAY", "DAY DIEN",
    "GOI", "BICH", "MACH", "BO MACH", "CONG TAC", "NHONG", "PULY MOTOR",
  ]);
  if (branded && component) return "Linh kiện motor";
  if (categoryIs(category, ["MOTOR", "MO TO"]) && component) return "Linh kiện motor";
  return "";
}

function accessoryGroup(category, code, name) {
  const direct = exactGroup(code);
  if (direct) return direct;
  const text = `${fold(code)} | ${fold(name)}`;
  if (containsAny(text, ["RON", "LONG NHEO", "PHOTLONG", "PULY", "BO ", "BAT ", "BULONG", "VIS", "CON TAN", "BAC DAN"])) {
    return categoryIs(category, ["DUC", "CN DUC"]) ? "Phụ kiện CN Đức" : "Phụ kiện chung";
  }
  if (containsAny(text, ["GOI", "CUM", "HAM", "VAI", "XOP", "V4", "SAT VUONG", "CAY KEO"])) return "Phụ kiện chung";
  return "";
}

export function resolveAlumdoorRealSellableGroup({ category, item_code, item_name, source_uom } = {}) {
  const direct = exactGroup(item_code);
  if (direct) return direct;
  const categoryText = fold(category);
  const code = fold(item_code);
  const name = fold(item_name);

  if (isAreaUom(source_uom)) {
    const finished = finishedDoorGroup(categoryText, code, name);
    if (finished) return finished;
  }

  const material = materialGroup(code, name);
  if (material) return material;

  const motorProduct = motorProductGroup(code, name);
  if (motorProduct) return motorProduct;

  const motorComponent = motorComponentGroup(categoryText, code, name);
  if (motorComponent) return motorComponent;

  const accessory = accessoryGroup(categoryText, code, name);
  if (accessory) return accessory;

  if (categoryIs(categoryText, ["MOTOR", "MO TO"])) return "Linh kiện motor";
  if (categoryIs(categoryText, ["DUC", "CN DUC"])) return "Phụ kiện CN Đức";
  if (categoryIs(categoryText, ["LUOI", "CUA LUOI", "UC", "CUA UC", "DAI LOAN", "DL", "SIEU TRUONG", "PHU KIEN", "RON", "LON", "BO"])) return "Phụ kiện chung";
  return "";
}

export function resolveAlumdoorRealStockGroup({ category, item_code, item_name } = {}) {
  const direct = exactGroup(item_code);
  if (direct) return direct;
  const categoryText = fold(category);
  const code = fold(item_code);
  const name = fold(item_name);
  const text = `${categoryText} | ${code} | ${name}`;

  const material = materialGroup(code, name);
  if (material) return material;

  if (containsAny(text, [
    "MOTOR", "MO TO", "ALUMAX", "YHLD", "YHTAIWAN", "TANKER",
    "NHONG", "PHANH", "TU DIEN", "CUON DAY", "THAN MOTOR", "BO MACH",
  ])) return "Linh kiện motor";

  if (containsAny(text, ["SON TINH DIEN", " STD", "-STD", "_STD"])) return "Phụ kiện cần sơn tĩnh điện";
  if (categoryIs(categoryText, ["DUC", "CN DUC"])) return "Phụ kiện CN Đức";
  return "Phụ kiện chung";
}
