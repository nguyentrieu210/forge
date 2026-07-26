import { Component, type ReactNode, useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Label } from "./ui";
import { api, clearToken, ENVIRONMENT_LABEL, getToken, setToken, TENANT_ID } from "./lib/api";
import { CloudForgeApiError, type WhoAmI } from "./lib/cloudforge";
import { viewForSeed, type Seed, type View } from "./lib/handoff";
import { SalesOrderScreen } from "./features/SalesOrder";
import { DeliveryNoteScreen } from "./features/DeliveryNote";
import { SalesInvoiceScreen } from "./features/SalesInvoice";
import { PaymentEntryScreen } from "./features/PaymentEntry";
import { DocumentsScreen } from "./features/Documents";
import { ReportsScreen } from "./features/Reports";
import { DeskScreen } from "./features/Desk";

const NAV: { view: View; label: string }[] = [
  { view: "sales-order", label: "Sales Order" },
  { view: "delivery-note", label: "Delivery Note" },
  { view: "sales-invoice", label: "Sales Invoice" },
  { view: "payment-entry", label: "Payment Entry" },
  { view: "documents", label: "Documents" },
  { view: "reports", label: "Reports" },
  { view: "desk", label: "Meta Desk" },
];

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">Something went wrong in the UI.</p>
          <p className="mt-1 text-muted-foreground">{this.state.error.message}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => this.setState({ error: null })}>Dismiss</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function TokenGate({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="mx-auto mt-24 max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
      <h1 className="text-lg font-semibold">CloudForge O2C</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Phase 1 has no login flow — paste a bearer token minted outside the app (tenant <span className="font-mono">{TENANT_ID}</span>).
      </p>
      <div className="mt-4 space-y-2">
        <Label htmlFor="token">Bearer token (JWT)</Label>
        <Input id="token" value={value} onChange={(e) => setValue(e.target.value)} placeholder="eyJhbGciOi..." />
      </div>
      <Button className="mt-4 w-full" disabled={!value.trim()} onClick={() => { setToken(value); onSaved(); }}>
        Use token
      </Button>
    </div>
  );
}

export function App() {
  const [hasToken, setHasToken] = useState(() => Boolean(getToken()));
  const [who, setWho] = useState<WhoAmI | null>(null);
  const [whoError, setWhoError] = useState<string | null>(null);
  const [view, setView] = useState<View>("sales-order");
  const [seed, setSeed] = useState<Seed | null>(null);

  const loadWho = useCallback(async () => {
    setWhoError(null);
    try {
      setWho(await api.getWhoAmI());
    } catch (error) {
      setWho(null);
      if (error instanceof CloudForgeApiError && error.status === 401) {
        setWhoError("Token rejected (401). Sign out and paste a valid token.");
      } else {
        setWhoError(error instanceof Error ? error.message : "Failed to load identity");
      }
    }
  }, []);

  useEffect(() => { if (hasToken) void loadWho(); }, [hasToken, loadWho]);

  // A handoff seed both routes to the target screen and is consumed there once.
  const handoff = useCallback((next: Seed) => {
    setSeed(next);
    setView(viewForSeed(next));
  }, []);

  if (!hasToken) return <TokenGate onSaved={() => setHasToken(true)} />;

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
          <span className="font-semibold">CloudForge ERP</span>
          <Badge variant="outline">env: {ENVIRONMENT_LABEL}</Badge>
          <Badge variant="secondary">tenant: {TENANT_ID}</Badge>
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Button key={item.view} size="sm" variant={view === item.view ? "default" : "ghost"} onClick={() => setView(item.view)}>
                {item.label}
              </Button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {who ? (
              <span className="text-sm text-muted-foreground">{who.actor_id} · {who.roles.join(", ")}</span>
            ) : (
              <span className="text-sm text-destructive">{whoError ?? "loading…"}</span>
            )}
            <Button size="sm" variant="outline" onClick={() => { clearToken(); setHasToken(false); setWho(null); }}>Sign out</Button>
          </div>
        </header>
        {/* All screens stay mounted so in-progress form state survives navigation and
            each handoff seed is consumed exactly once by its target. */}
        <main className="mx-auto max-w-5xl p-4">
          <div className={view === "sales-order" ? "" : "hidden"}><SalesOrderScreen seed={seed} onHandoff={handoff} /></div>
          <div className={view === "delivery-note" ? "" : "hidden"}><DeliveryNoteScreen seed={seed} onHandoff={handoff} /></div>
          <div className={view === "sales-invoice" ? "" : "hidden"}><SalesInvoiceScreen seed={seed} onHandoff={handoff} /></div>
          <div className={view === "payment-entry" ? "" : "hidden"}><PaymentEntryScreen seed={seed} onHandoff={handoff} /></div>
          <div className={view === "documents" ? "" : "hidden"}><DocumentsScreen onHandoff={handoff} /></div>
          <div className={view === "reports" ? "" : "hidden"}><ReportsScreen /></div>
          <div className={view === "desk" ? "" : "hidden"}><DeskScreen /></div>
        </main>
      </div>
    </ErrorBoundary>
  );
}
