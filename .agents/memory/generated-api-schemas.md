---
name: Generated API schema compatibility
description: Runtime compatibility between generated API validators and the workspace’s installed Zod version.
---

Generated API validators must use methods available in the Zod major version installed by the workspace. A code generator can emit a newer API such as `zod.int()` while the app still installs Zod 3, which makes the API crash during module initialization before any route is reachable.

**Why:** The imported API workflow built successfully but crashed on startup because generated validators targeted a newer Zod API than the installed dependency.

**How to apply:** After code generation or dependency changes, run the API server and a typecheck; do not treat a successful bundle build as proof that generated validators can execute.