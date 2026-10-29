export async function requestPasswordRecovery(client, email, redirectTo) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const failure = error => ({ success: false, emailSent: false, error, email: normalizedEmail });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return failure("Enter a valid email address.");
  if (!client) return failure("Password recovery is unavailable. Please contact info@trainailtd.com.");
  try {
    const { data, error } = await client.functions.invoke("send-password-reset", {
      body: { email: normalizedEmail, redirectTo },
    });
    // Function HTTP failures carry their status/body on context, not status.
    const status = error?.context?.status || error?.status;
    let payload = data;
    if (error?.context?.json) {
      try { payload = await error.context.json(); } catch {}
    }
    if (status === 429 || payload?.rateLimited) return {
      ...failure("Too many reset requests. Please wait 15 minutes before trying again."), rateLimited: true,
    };
    if (!error && payload?.success === true) return {
      success: true, emailSent: payload.emailSent === true, email: normalizedEmail, rateLimited: false,
    };
    // Never return recovery tokens or action links to an unauthenticated browser.
    // Native Auth remains a fallback only when the function is not deployed.
    if (status !== 404) return failure(payload?.error || "The recovery email could not be sent. Please retry or contact info@trainailtd.com.");
    const result = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    if (result.error) return { ...failure(result.error.message), rateLimited: result.error.status === 429 };
    return { success: true, emailSent: false, requestAccepted: true, email: normalizedEmail };
  } catch {
    return failure("Could not reach the recovery service. Check your connection and try again.");
  }
}
