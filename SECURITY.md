# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `@vllnt/convex-mcp`, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email: **security@bntvllnt.com**

You will receive a response within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Design

- **Default-deny auth**: Server throws at startup without `auth.validate`
- **Generic error messages**: Convex error details never leaked to MCP clients
- **Bearer-only tokens**: Non-Bearer auth schemes rejected
- **No secrets in source**: All credentials via environment variables
- **Hook error isolation**: Hook failures never crash the server
