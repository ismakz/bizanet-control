export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startExpirationEnforcerLoop } = await import(
      "@/lib/mikrotik-expiration-enforcer"
    );
    startExpirationEnforcerLoop();
  }
}
