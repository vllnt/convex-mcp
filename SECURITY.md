# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `@vllnt/convex-mcp`, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, reach out via [Discord](https://bntvllnt.com/discord), [X](https://bntvllnt.com/x), or open a [GitHub security advisory](https://github.com/vllnt/convex-mcp/security/advisories/new).

We will respond promptly and coordinate a fix before any public disclosure.

## Supported Versions

The current stable legacy release is `0.3.1` on npm `latest` at this audit.
Use that release when reproducing a report. Canary builds are prereleases;
this policy does not promise backports or a maintenance window for older releases.
Contact the maintainers if you need a fix on an older version.

For new integrations, see the [migration guide](README.md#legacy-package-and-migration)
for `@vllnt/convex-helpers/mcp`. The legacy repository is not archived and its npm
package is not deprecated at this audit; migration does not imply completed retirement.

## Security Design

- **Default-deny auth**: Server throws at startup without `auth.validate`
- **Generic error messages**: Convex error details never leaked to MCP clients
- **Bearer-only tokens**: Non-Bearer auth schemes rejected
- **No secrets in source**: All credentials via environment variables
- **Hook error isolation**: Hook failures never crash the server
