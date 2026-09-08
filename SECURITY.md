# Security Policy

## Supported Versions

Security updates are applied to the latest release of the reference implementation.

| Version | Supported          |
| :--- | :--- |
| `1.0.x` | :white_check_mark: |
| `< 1.0.0` | :x:                |

---

## Reporting a Vulnerability

We take the security of our open-source codebase seriously. If you discover a potential security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue** with vulnerability details or exploit code.
2. Submit a report via **GitHub Private Vulnerability Reporting** on the repository page (under the **Security** tab -> **Advisories**).
3. If private reporting is unavailable, please open a minimal issue requesting a private communication channel with maintainers.

### What to Include
- Detailed description of the vulnerability.
- Minimal reproducible proof of concept (curl command, script, or test case).
- Potential impact and threat model.
- Any suggested remediations or mitigations.

### Response Timelines
- **Initial Acknowledgment**: Within 48 business hours.
- **Triage & Validation**: Within 5 business days.
- **Patch Release & Disclosure**: Coordinated following fix validation.

---

## Architectural Security Model (Reference Implementation)

Please note the following scope boundaries of this reference implementation:

- **Authentication & Authorization**: This reference implementation includes mock user context (`x-user-id` headers) for rate-limiting and persistence demonstration. In a production deployment, replace this with an authenticated JWT / OAuth2 / OIDC reverse proxy or API gateway.
- **API Keys**: Model provider credentials (e.g. `OPENAI_API_KEY`) must only be supplied via environment variables or secret vaults (e.g. AWS Secrets Manager, HashiCorp Vault), never hardcoded or client-accessible.
- **Network Boundaries**: Redis and PostgreSQL instances must not be exposed directly to public ingress.
