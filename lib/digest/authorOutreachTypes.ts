export type AuthorOutreachStatus =
  | "pending"
  | "held"
  | "never"
  | "skipped_no_email"
  | "cancelled"
  | "sent"
  | "skipped_optout";

export type AuthorOutreachRow = {
  pmid: string;
  corresponding_email: string | null;
  corresponding_name: string | null;
  title: string | null;
  journal: string | null;
  headline: string | null;
  status: AuthorOutreachStatus;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  queued_at: string;
  updated_at: string;
  sent_at: string | null;
  resend_id: string | null;
  error: string | null;
};
