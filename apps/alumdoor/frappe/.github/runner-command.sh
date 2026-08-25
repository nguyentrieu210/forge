#!/usr/bin/env bash
set -Eeuo pipefail
# dispatch: installed-app-check-fix-20260824-2029
chmod +x .github/scripts/deploy-frappe.sh
exec .github/scripts/deploy-frappe.sh
