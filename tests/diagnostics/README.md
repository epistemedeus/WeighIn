# Startup ownership diagnostic

Run `node tests/diagnostics/startup-ownership.cjs` from this checkout with Node.
No package installation or Docker daemon is needed. The probe executes the real
`start-local-network.sh` with isolated Docker and Node command doubles, each in
an owned temporary directory removed in `finally`.

At source `1b6404e286b91fc65e998dcbf938ac5e3dbde589` it exits **2**: the startup
failure remains a failure and logs are captured, but the newly created container
ID is not retained or cleaned up. The successful-start and unrelated-container
collision controls pass. Exit 2 is an unmet acceptance contract, not a harness
crash. The JSON includes the exact script hash, command calls and process output.

This is a bounded source-level reproduction for issue #218. It does not repair
the script, run a real readiness/funding request, prove installed Docker behavior,
or satisfy native/network acceptance. It makes no assignment or reward claim.
No implementation is proposed while contributor selection is unresolved.
