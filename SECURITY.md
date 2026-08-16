# Security policy

## Supported versions

`itaiji-normalize` is pre-1.0. Fixes go into the next release from `main`; released
versions are not patched retroactively.

| Version | Supported |
| --- | --- |
| Latest 0.1.x | Yes |
| Anything older | No |

## Reporting a vulnerability

Please report privately through GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/tomatomerde/itaiji-normalize/security/advisories/new).

Do not open a public issue for a suspected vulnerability. If private reporting
is unavailable to you for any reason, open an issue that says only that you have
a security report and asks for a private channel — no details.

Please include the package version, the runtime and its version, and the
smallest input that reproduces the problem.

This is a single-maintainer project. Expect a first reply within about a week;
there is no guaranteed response time, and saying so honestly is better than
publishing a service level this project cannot hold to.

## Scope

In scope: anything in this repository that lets input control something it should
not — remote code execution, a crash that cannot be caught by the documented error
handling, unbounded memory or CPU growth from an input of ordinary size, or the
library reaching the network when it claims not to.

Out of scope: incorrect output on its own. Wrong readings, wrong dates, or a
conversion this library declines to make are bugs — please file them as issues, not
as vulnerabilities. Variant relationships come from the MJ character information and
the public notices it cites; a disagreement with those sources is a data question,
and the sources are named in PROVENANCE.md.