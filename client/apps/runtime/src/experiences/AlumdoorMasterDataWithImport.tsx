import { Upload } from "lucide-react";
import { Button } from "@metaforge/ui";
import { AlumdoorMasterDataScreen, type AlumdoorMasterItem } from "./AlumdoorMasterDataScreen.js";

interface Props {
  items: AlumdoorMasterItem[];
  onNavigate: (route: string) => void;
}

export function AlumdoorMasterDataWithImport({ items, onNavigate }: Props) {
  const customerVisible = items.some((item) => item.key === "Customer");
  return (
    <div className="space-y-4">
      {customerVisible ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onNavigate("/import?doctype=Customer")}>
            <Upload className="size-4" aria-hidden="true" /> Nhập khách hàng
          </Button>
        </div>
      ) : null}
      <AlumdoorMasterDataScreen items={items} onNavigate={onNavigate} />
    </div>
  );
}
