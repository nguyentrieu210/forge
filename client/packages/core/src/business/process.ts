export interface ProcessCounter {
  count: number;
  overdue?: number;
  error?: number;
  averageMinutes?: number;
}

export interface ProcessStage {
  key: string;
  label: string;
  icon?: string;
  sourceType: "doctype" | "report" | "page" | "action" | "experience";
  source: string;
  route: string;
  description?: string;
  counter?: ProcessCounter;
  requiredCapability?: string;
  roles?: string[];
  status?: "ready" | "warning" | "blocked" | "complete";
  filters?: Record<string, unknown>;
}

export interface ProcessEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ProcessDefinition {
  key: string;
  label: string;
  description?: string;
  app: string;
  icon?: string;
  roles?: string[];
  requiredContexts?: string[];
  stages: ProcessStage[];
  edges: ProcessEdge[];
}

export interface ProcessCatalog {
  processes: ProcessDefinition[];
  domain?: string;
  unsupported?: boolean;
}
