# ALU UI deploy trigger — PR opened

This no-op client marker exists only to trigger the one-shot production UI deploy workflow. The workflow deploys the PR base SHA already on `main`; this branch content itself is not deployed.

Synchronize event requested after enabling the one-shot deploy workflow.
