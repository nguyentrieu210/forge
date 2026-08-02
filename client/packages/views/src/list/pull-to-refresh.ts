/**
 * Pull-to-refresh cho vùng cuộn của List (điện thoại/tablet cảm ứng).
 * Nghe touch bằng addEventListener THỦ CÔNG với { passive: false } — bắt buộc, vì React gắn
 * touchmove ở root dạng passive nên preventDefault() trong onTouchMove sẽ bị bỏ qua (kèm warning)
 * và trang sẽ bị "nảy" theo trình duyệt thay vì kéo được thanh làm mới.
 * Không đụng chuột/bàn phím: desktop đã có nút Làm mới trên toolbar.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

const THRESHOLD = 64; // px kéo tối thiểu để kích hoạt
const MAX = 96; // trần khoảng kéo hiển thị
const DAMPING = 0.5; // kéo 2px ⇒ đi 1px, cho cảm giác có lực cản

export interface PullToRefreshState {
  /** khoảng kéo hiện tại (px) để vẽ thanh chỉ báo. */
  distance: number;
  refreshing: boolean;
  /** đã kéo đủ ngưỡng — đổi nhãn "Kéo để làm mới" → "Thả để làm mới". */
  armed: boolean;
}

export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh?: () => void | Promise<unknown>,
): PullToRefreshState {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  // Giữ handler mới nhất trong ref: effect chỉ gắn listener lại khi khả năng refresh bật/tắt,
  // không gắn lại mỗi lần cha render (onRefresh thường là arrow function mới mỗi render).
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  const enabled = Boolean(onRefresh);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) {
      startY.current = null;
      setDistance(0);
      return;
    }

    const onTouchStart = (e: TouchEvent) => {
      // Chỉ bắt đầu khi đang ở đỉnh danh sách; đang cuộn giữa chừng thì đây là cuộn bình thường.
      startY.current = el.scrollTop <= 0 && !refreshingRef.current ? (e.touches[0]?.clientY ?? null) : null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const y = e.touches[0]?.clientY;
      if (y === undefined) return;
      const delta = y - startY.current;
      if (delta <= 0) {
        // Đổi hướng sang kéo lên ⇒ trả quyền cuộn lại cho trình duyệt.
        startY.current = null;
        setDistance(0);
        return;
      }
      e.preventDefault(); // chặn overscroll/bounce của trình duyệt để thanh kéo mượt
      setDistance(Math.min(delta * DAMPING, MAX));
    };

    const finish = () => {
      const pulled = startY.current !== null;
      startY.current = null;
      if (!pulled) return;
      setDistance((d) => {
        if (d < THRESHOLD || refreshingRef.current) return 0;
        refreshingRef.current = true;
        setRefreshing(true);
        void Promise.resolve(onRefreshRef.current?.()).finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setDistance(0);
        });
        return THRESHOLD; // giữ thanh ở ngưỡng trong lúc đang tải
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", finish, { passive: true });
    el.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [scrollRef, enabled]);

  return { distance, refreshing, armed: distance >= THRESHOLD };
}
