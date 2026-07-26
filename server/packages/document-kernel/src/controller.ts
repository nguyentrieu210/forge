import type { CanonicalDocument, JsonObject, MutationCommand, MutationPlan } from "../../contracts/src/index.js";
import type { DomainReader } from "./store.js";

export interface ControllerContext<T extends JsonObject> {
  command: MutationCommand<T>;
  existing: CanonicalDocument<T> | null;
  now: string;
  nextVersion: number;
  reader: DomainReader;
}

export interface DocumentController<T extends JsonObject = JsonObject> {
  readonly doctype: string;
  buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> | MutationPlan<T>;
}

export class ControllerRegistry {
  private readonly controllers = new Map<string, DocumentController>();
  private fallback: DocumentController | null = null;

  register<T extends JsonObject>(controller: DocumentController<T>): this {
    this.controllers.set(controller.doctype, controller as DocumentController);
    return this;
  }

  setFallback(controller: DocumentController): this {
    this.fallback = controller;
    return this;
  }

  get(doctype: string): DocumentController {
    const controller = this.controllers.get(doctype) ?? this.fallback;
    if (!controller) throw new Error(`No controller registered for ${doctype}`);
    return controller;
  }
}
