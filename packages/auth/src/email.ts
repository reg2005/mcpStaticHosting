/**
 * Minimal email sender. Uses Resend when RESEND_API_KEY is set, otherwise logs
 * to the console (dev). No SDK dependency — just the HTTP API.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export async function sendEmail({ to, subject, text }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "mcphosting <noreply@example.com>";

  if (!apiKey) throw new Error("Email delivery is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status}`);
  }
}
