# Gateway Route Policy

Production Gateway deployments intentionally keep only explicitly named `kairo.vn` Custom Domains from `server/apps/gateway-worker/wrangler.jsonc`.

Do not add a wildcard Worker Route such as `*.kairo.vn/*`. Customer hostnames must be provisioned explicitly so unrelated subdomains are not captured by Forge.

This documentation change is operationally inert for the client bundle; its merge is used to run the canonical `ALU Build and Deploy` UI/Gateway lane after the wildcard route source configuration was removed.
