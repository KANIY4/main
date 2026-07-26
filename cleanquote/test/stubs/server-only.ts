/**
 * Stands in for the `server-only` package under test.
 *
 * The real package has a client entry point that throws on import, which is how
 * it turns "a server module reached a client bundle" into a build failure. Tests
 * have no client bundle, so importing the real thing would fail for a reason
 * that has nothing to do with the code under test.
 */
export {};
