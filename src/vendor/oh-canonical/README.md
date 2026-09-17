# `oh-canonical-raw-wasm` artifact

Vendored build of `rust/oh-canonical-raw-wasm` from the `hraness/oh` repository.

- Engine identity: `oh.canonical.rust.v1`
- Loader: `src/oh/canonical-rust.ts`
- Rebuild: in the `oh` worktree, run
  `cargo build --release --target wasm32-unknown-unknown -p oh-canonical-raw-wasm`,
  then regenerate `artifact.ts` from the new `.wasm` SHA-256 and base64.

The base64-embedded module is embedded so it works in Bun without depending on a
specific bundler's WASM support.
