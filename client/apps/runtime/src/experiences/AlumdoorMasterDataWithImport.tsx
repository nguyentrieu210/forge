import { AlumdoorMasterDataScreen, type AlumdoorMasterItem } from "./AlumdoorMasterDataScreen.js";

interface Props {
  items: AlumdoorMasterItem[];
  onNavigate: (route: string) => void;
}

export function AlumdoorMasterDataWithImport({ items, onNavigate }: Props) {
  return <AlumdoorMasterDataScreen items={items} onNavigate={onNavigate} />;
}
