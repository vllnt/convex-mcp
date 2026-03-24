# Contributing to @vllnt/convex-mcp

Thanks for your interest in contributing!

## Setup

```bash
git clone https://github.com/vllnt/convex-mcp.git
cd convex-mcp
pnpm install
```

## Development

```bash
pnpm dev          # Watch mode build
pnpm test:watch   # Watch mode tests
pnpm typecheck    # Type checking
pnpm lint         # Linting
```

## Pull Request Process

1. Fork the repo and create a feature branch
2. Write tests for new functionality
3. Ensure `pnpm test` and `pnpm typecheck` pass
4. Submit a PR with a clear description of changes

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` + type guards)
- Explicit return types on exported functions
- Tests for all public API changes

## Questions?

Open a [GitHub discussion](https://github.com/vllnt/convex-mcp/discussions), join the [Discord](https://bntvllnt.com/discord), or reach out on [X](https://bntvllnt.com/x).
