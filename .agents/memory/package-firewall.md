---
name: Package firewall recovery
description: Replit package firewall behavior encountered while restoring the imported workspace.
---

The imported lockfile can pin a dev-only generator release that the package firewall refuses to download even though the project dependency range allows a newer release. Updating only that generator to a current compatible version and reinstalling with the workspace lockfile preserves the app stack and restores the toolchain.

**Why:** The initial install was blocked by a 403 for the pinned generator archive, while the rest of the workspace was healthy.

**How to apply:** Inspect the direct dependency and its semver range first; prefer the newest compatible release rather than bypassing the firewall or changing unrelated packages.