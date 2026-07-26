/** @jsxImportSource react */
/**
 * Awesomebar (M03) — cmdk. Nhóm: Actions · DocTypes · Records · Recent.
 * Records = async (searchRecords) với debounce + AbortController + chống kết quả stale + min-length.
 * Quyền lọc ở SERVER (searchRecords chỉ trả record user đọc được). `/` và Ctrl+K do app mở.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { FileText, Plus, Search as SearchIcon, Clock, LayoutGrid } from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@metaforge/ui";

export interface AwesomeAction {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}
export interface AwesomeDoctype {
  name: string;
  label?: string;
}
export interface AwesomeRecord {
  doctype: string;
  name: string;
  title?: string;
}
export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions?: AwesomeAction[];
  doctypes?: AwesomeDoctype[];
  recent?: AwesomeRecord[];
  searchRecords?: (query: string, signal: AbortSignal) => Promise<AwesomeRecord[]>;
  onSelectDoctype?: (doctype: string) => void;
  onSelectRecord?: (r: AwesomeRecord) => void;
  placeholder?: string;
}

const MIN_LEN = 2;

export function CommandPalette(props: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [records, setRecords] = useState<AwesomeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (props.open) {
      setQ("");
      setRecords([]);
    }
  }, [props.open]);

  // async records: debounce 220ms + AbortController + stale guard (seq)
  useEffect(() => {
    const search = props.searchRecords;
    const query = q.trim();
    if (!search || query.length < MIN_LEN) {
      setRecords([]);
      setLoading(false);
      return;
    }
    const mySeq = ++seq.current;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      void search(query, ctrl.signal)
        .then((r) => {
          if (mySeq === seq.current) setRecords(r);
        })
        .catch(() => {})
        .finally(() => {
          if (mySeq === seq.current) setLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, props.searchRecords]);

  const ql = q.trim().toLowerCase();
  const actions = (props.actions ?? []).filter((a) => !ql || a.label.toLowerCase().includes(ql));
  const doctypes = (props.doctypes ?? []).filter((d) => !ql || (d.label ?? d.name).toLowerCase().includes(ql)).slice(0, 8);
  const recent = props.recent ?? [];

  const close = () => props.onClose();

  return (
    <CommandDialog open={props.open} onOpenChange={(o) => !o && close()} shouldFilter={false}>
      {/* shouldFilter=false: tự lọc (actions/doctypes) + async records */}
      <CommandInput value={q} onValueChange={setQ} placeholder={props.placeholder ?? "Tìm lệnh, DocType, bản ghi…"} />
      <CommandList>
          <CommandEmpty>{loading ? "Đang tìm…" : "Không có kết quả."}</CommandEmpty>

          {actions.length ? (
            <CommandGroup heading="Hành động">
              {actions.map((a) => (
                <CommandItem key={a.id} value={`action-${a.id}`} onSelect={() => { a.run(); close(); }}>
                  {a.icon ?? <Plus />} <span>{a.label}</span>
                  {a.hint ? <CommandShortcut>{a.hint}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {doctypes.length ? (
            <CommandGroup heading="DocType">
              {doctypes.map((d) => (
                <CommandItem key={d.name} value={`dt-${d.name}`} onSelect={() => { props.onSelectDoctype?.(d.name); close(); }}>
                  <LayoutGrid /> <span>{d.label ?? d.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {records.length ? (
            <CommandGroup heading="Bản ghi">
              {records.map((r) => (
                <CommandItem key={`${r.doctype}/${r.name}`} value={`rec-${r.doctype}-${r.name}`} onSelect={() => { props.onSelectRecord?.(r); close(); }}>
                  <FileText /> <span className="truncate">{r.title ?? r.name}</span>
                  <CommandShortcut>{r.doctype}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {!ql && recent.length ? (
            <CommandGroup heading="Gần đây">
              {recent.slice(0, 6).map((r) => (
                <CommandItem key={`recent-${r.doctype}/${r.name}`} value={`recent-${r.doctype}-${r.name}`} onSelect={() => { props.onSelectRecord?.(r); close(); }}>
                  <Clock /> <span className="truncate">{r.title ?? r.name}</span>
                  <CommandShortcut>{r.doctype}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
      </CommandList>
    </CommandDialog>
  );
}

export { SearchIcon };
