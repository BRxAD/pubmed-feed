import "server-only";

export async function sendDigestEmail(options: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const from =
    process.env.DIGEST_FROM_EMAIL?.trim() ??
    "ASP Feed <onboarding@resend.dev>";

  const replyTo = process.env.DIGEST_REPLY_TO?.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(data.message ?? `Resend HTTP ${res.status}`);
  }

  return { id: data.id };
}
