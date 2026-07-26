/**
 * useOfflineQueue — hàng đợi thao tác App-mode khi mất mạng (client-only, localStorage). App-mode
 * (kho GIAO/NHẬN...) thường dùng ở hiện trường, mạng chập chờn — trước đây 1 thao tác lỡ mất mạng là
 * mất luôn, phải tự nhớ làm lại. Generic theo payload T — không biết trước app gọi API cụ thể nào
 * (vd aphvh.api.wms.transfer_issue ngoài repo), caller tự cấp `run(payload)`.
 * Thứ tự: enqueue → còn mạng thì thử NGAY; mất mạng/lỗi mạng thì giữ lại hàng đợi, tự phát lại khi
 * có sự kiện "online". Lỗi KHÔNG PHẢI do mạng (server từ chối) → báo lỗi ngay, không giữ lại (retry
 * mãi 1 lỗi nghiệp vụ thật vô nghĩa, dễ gây trùng lặp nếu cứ gửi lại).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface OfflineQueueEntry<T> {
  id: string;
  createdAt: number;
  payload: T;
}

export interface UseOfflineQueueResult<T> {
  /** thử chạy ngay nếu có mạng; mất mạng → xếp hàng (KHÔNG throw, trả "queued") — caller tự quyết
   * hiện thông báo nào ("Đã gửi" vs "Đã lưu, gửi khi có mạng"). Lỗi nghiệp vụ thật vẫn throw bình thường. */
  enqueue: (payload: T) => Promise<"sent" | "queued">;
  pending: OfflineQueueEntry<T>[];
  /** phát lại thủ công (vd người dùng tự bấm "Gửi lại" thay vì chờ sự kiện online). */
  flush: () => Promise<void>;
}

function isNetworkError(e: unknown): boolean {
  // fetch lỗi mạng thật thường là TypeError "Failed to fetch"/"NetworkError" — lỗi server (4xx/5xx đã
  // có response) sẽ là lỗi khác (adapter tự throw AppError có .kind). Không đoán quá tay: mặc định
  // COI LÀ lỗi mạng chỉ khi navigator.onLine đang false hoặc message khớp mẫu quen thuộc.
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /failed to fetch|network ?error|load failed/i.test(msg);
}

export function useOfflineQueue<T>(storageKey: string, run: (payload: T) => Promise<void>): UseOfflineQueueResult<T> {
  const key = `mf-offline-queue:${storageKey}`;
  const [pending, setPending] = useState<OfflineQueueEntry<T>[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as OfflineQueueEntry<T>[]) : [];
    } catch {
      return [];
    }
  });
  const persist = useCallback((list: OfflineQueueEntry<T>[]) => {
    setPending(list);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* private mode — hàng đợi chỉ sống trong bộ nhớ phiên này */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const runRef = useRef(run);
  runRef.current = run;
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      // đọc lại từ localStorage (không dùng closure `pending` có thể cũ) — phát TUẦN TỰ, dừng ngay
      // khi gặp lỗi mạng (giữ nguyên phần còn lại), bỏ khỏi hàng đợi khi thành công HOẶC lỗi nghiệp vụ.
      let list: OfflineQueueEntry<T>[];
      try { list = JSON.parse(localStorage.getItem(key) ?? "[]") as OfflineQueueEntry<T>[]; } catch { list = []; }
      for (const entry of [...list]) {
        try {
          await runRef.current(entry.payload);
          list = list.filter((e) => e.id !== entry.id);
          persist(list);
        } catch (e) {
          if (isNetworkError(e)) break; // còn mất mạng — dừng, giữ nguyên phần còn lại
          list = list.filter((e) => e.id !== entry.id); // lỗi nghiệp vụ thật — bỏ khỏi hàng đợi, không lặp vô ích
          persist(list);
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [key, persist]);

  useEffect(() => {
    void flush(); // mount → thử phát nốt hàng đợi cũ (vd mở lại app sau khi có mạng)
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const enqueue = useCallback(async (payload: T): Promise<"sent" | "queued"> => {
    try {
      await runRef.current(payload);
      return "sent";
    } catch (e) {
      if (!isNetworkError(e)) throw e; // lỗi nghiệp vụ thật — để nguyên cho UI báo lỗi, KHÔNG xếp hàng
      const entry: OfflineQueueEntry<T> = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), payload };
      let list: OfflineQueueEntry<T>[];
      try { list = JSON.parse(localStorage.getItem(key) ?? "[]") as OfflineQueueEntry<T>[]; } catch { list = []; }
      persist([...list, entry]);
      return "queued";
    }
  }, [key, persist]);

  return { enqueue, pending, flush };
}
