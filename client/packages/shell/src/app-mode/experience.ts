import type { ReactNode } from "react";

/**
 * App-mode "Experience" — màn nghiệp vụ đóng gói TAY (touch-first, mobile/tablet),
 * khác Desk-mode (auto-sinh List/Form từ metadata). Vẫn dùng chung adapter/meta của MetaForge
 * nhưng UI thiết kế riêng cho nhân viên hiện trường (nút to, quét mã, 1 tay).
 * Engine chỉ cung cấp khung (MobileShell + registry + touch primitives); màn cụ thể do app đăng ký.
 */
export interface Experience {
  /** khoá route: /x/<key> */
  key: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** component màn — render trong MobileShell. */
  render: () => ReactNode;
}

export interface ExperienceRegistry {
  list(): Experience[];
  get(key: string): Experience | undefined;
}

export function createExperienceRegistry(experiences: Experience[]): ExperienceRegistry {
  const map = new Map(experiences.map((e) => [e.key, e]));
  return {
    list: () => experiences,
    get: (key) => map.get(key),
  };
}

export interface ExperienceRouteProps {
  registry: ExperienceRegistry;
  /** key hiện tại — router-agnostic (giống @metaforge/views): app tự lấy từ router riêng (vd
   * react-router `useParams().key`) rồi truyền vào, component này KHÔNG biết gì về router. */
  activeKey: string;
  /** key không có trong registry (chưa đăng ký Experience nào) — "chưa triển khai", KHÔNG throw. */
  renderNotFound?: (key: string) => ReactNode;
}

/** ExperienceRoute — cầu nối registry → route (P1-MANIFEST-01 mở rộng: `nav.kind="experience"`).
 * `apps/demo` VÀ template `create-metaforge-app` dùng CHUNG — trước đây mỗi app tự hard-code
 * `<Route path="/x/receive">` riêng (review độc lập bắt được registry định nghĩa nhưng không ai dùng). */
export function ExperienceRoute({ registry, activeKey, renderNotFound }: ExperienceRouteProps): ReactNode {
  const exp = registry.get(activeKey);
  if (!exp) return renderNotFound ? renderNotFound(activeKey) : null;
  return exp.render();
}
