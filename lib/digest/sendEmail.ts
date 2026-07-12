import "server-only";
import {
  getDigestFromAddress,
  getBriefDigestFromAddress,
  getDigestReplyTo,
} from "@/lib/digest/config";

export async function sendDigestEmail(options: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  bcc?: string[];
}): Promise<{ id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  const from = options.from ?? getDigestFromAddress();
  const replyTo = getDigestReplyTo();

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
      ...(options.bcc?.length ? { bcc: options.bcc } : {}),
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

/** Send the same message to each recipient (private inboxes, Resend-friendly). */
export async function sendDigestEmailToEach(options: {
  recipients: string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
}): Promise<{ sent: number; failed: string[]; lastId?: string }> {
  const { recipients, ...payload } = options;
  if (recipients.length === 0) {
    return { sent: 0, failed: [] };
  }

  let sent = 0;
  const failed: string[] = [];
  let lastId: string | undefined;

  for (const email of recipients) {
    try {
      const result = await sendDigestEmail({ ...payload, to: [email] });
      sent += 1;
      lastId = result.id;
    } catch (err) {
      failed.push(
        `${email}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (sent === 0 && failed.length > 0) {
    throw new Error(failed[0] ?? "All recipient sends failed");
  }

  return { sent, failed, lastId };
}
