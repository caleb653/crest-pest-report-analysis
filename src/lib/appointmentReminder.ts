/**
 * Appointment-reminder plumbing for upcoming portal visits.
 *
 * - The scheduled arrival window lives on `portal_services.report_data
 *   .scheduled_window` ({ start, end }) so it works identically for
 *   apartment, HOA and commercial visits without touching `service_time`
 *   (which the commercial card uses for time-in/time-out and the apartment
 *   completion flow overwrites).
 * - Every report_data write here is FETCH-FRESH → MERGE → UPDATE so we never
 *   clobber drafts, office notes, overage markers, etc. that share the JSON.
 * - Sending goes through the `send-appointment-reminder` edge function and
 *   stamps `report_data.reminder_sent_at` / `reminder_recipient` on success.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ScheduledWindow } from "./appointmentReminderEmail";

export type { ScheduledWindow } from "./appointmentReminderEmail";
export { formatArrivalWindow, to12h } from "./appointmentReminderEmail";

export interface ReminderStamp {
  sent_at: string;
  recipient: string;
}

export const readScheduledWindow = (service: object | null | undefined): ScheduledWindow | null => {
  const w = ((service as { report_data?: unknown } | null | undefined)?.report_data as Record<string, unknown> | null | undefined)?.scheduled_window;
  if (!w || typeof w !== "object") return null;
  const { start: rawStart, end: rawEnd } = w as { start?: unknown; end?: unknown };
  const start = typeof rawStart === "string" ? rawStart.trim() : "";
  if (!start) return null;
  const end = typeof rawEnd === "string" && rawEnd.trim() ? rawEnd.trim() : null;
  return { start, end };
};

export const readReminderStamp = (service: object | null | undefined): ReminderStamp | null => {
  const rd = (service as { report_data?: unknown } | null | undefined)?.report_data as Record<string, unknown> | null | undefined;
  if (!rd?.reminder_sent_at) return null;
  return { sent_at: String(rd.reminder_sent_at), recipient: String(rd.reminder_recipient || "") };
};

/** Fetch the current report_data, merge the patch in, write it back. */
async function mergeReportData(serviceId: string, patch: Record<string, unknown>): Promise<void> {
  const { data: fresh, error: readErr } = await supabase
    .from("portal_services")
    .select("report_data")
    .eq("id", serviceId)
    .maybeSingle();
  if (readErr) throw readErr;
  const merged = { ...(((fresh as { report_data?: unknown } | null)?.report_data as Record<string, unknown> | null) || {}), ...patch };
  const { error: writeErr } = await supabase
    .from("portal_services")
    .update({ report_data: merged as Json })
    .eq("id", serviceId);
  if (writeErr) throw writeErr;
}

/** Persist (or clear, with `null`) the arrival window on an upcoming visit. */
export async function saveScheduledWindow(serviceId: string, window: ScheduledWindow | null): Promise<void> {
  const value = window?.start
    ? { start: window.start, end: window.end || null, updated_at: new Date().toISOString() }
    : null;
  await mergeReportData(serviceId, { scheduled_window: value });
}

/**
 * Who gets the reminder: the PROPERTY point-of-contact email wins, then the
 * client-level email (same precedence as the completion email).
 */
export function resolveReminderRecipient(
  property: { customer_preferences?: unknown } | null | undefined,
  clientEmail?: string | null,
): { email: string; name: string } {
  const poc = ((property?.customer_preferences as Record<string, unknown> | null | undefined)?.point_of_contact as { email?: unknown; name?: unknown } | undefined) || {};
  const pocEmail = typeof poc.email === "string" && poc.email.trim().includes("@") ? poc.email.trim() : "";
  const name = typeof poc.name === "string" ? poc.name.trim() : "";
  const fallback = typeof clientEmail === "string" && clientEmail.trim().includes("@") ? clientEmail.trim() : "";
  return { email: pocEmail || fallback, name };
}

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export interface SendReminderArgs {
  serviceId: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  propertyName: string;
}

/** Send via the edge function, then stamp the service row. Throws on failure. */
export async function sendAppointmentReminder(args: SendReminderArgs): Promise<void> {
  const { data, error } = await supabase.functions.invoke("send-appointment-reminder", {
    body: {
      to: args.to.trim(),
      ccEmails: (args.cc || []).map((c) => c.trim()).filter(isValidEmail),
      subject: args.subject,
      html: args.html,
      propertyName: args.propertyName,
      serviceId: args.serviceId,
    },
  });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || "send_failed");

  try {
    await mergeReportData(args.serviceId, {
      reminder_sent_at: new Date().toISOString(),
      reminder_recipient: args.to.trim(),
    });
  } catch (e) {
    // The email already went out — a failed stamp must not surface as a send error.
    console.warn("could not stamp reminder_sent_at", e);
  }
}
