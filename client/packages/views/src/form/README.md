# Document form boundary

This directory contains the generic document-editing primitive used by create/edit/detail CRUD flows.

It is **not** a standalone application view.

Rules:

- no sidebar/menu/route named `Form View`;
- no app or vertical business logic in the generic renderer;
- field/layout behavior comes from canonical metadata and server-owned rules;
- child tables are controls inside a document, not a global Grid/Bulk view;
- app-specific workbenches must not be reintroduced here;
- business calculation, permission, lifecycle and compound writes remain server authority.

The canonical DocType workspace is list/tree -> document -> context. Any future composition must remain declaration-driven and reuse this primitive rather than fork it.
