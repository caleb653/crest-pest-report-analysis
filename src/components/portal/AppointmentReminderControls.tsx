/**
 * Scheduled-arrival window + "Send Appointment Reminder" for an UPCOMING visit.
 *
 * Shared by the apartment/HOA admin dashboard (PropertyDashboard) and the
 * commercial admin dashboard (CommercialDashboardView). The reminder dialog
 * shows a live preview of the exact email the property manager will get.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Clock, Mail, Send, Check } from "lucide-react";
import { buildAppointmentReminderEmail } from "@/lib/appointmentReminderEmail";
import {
  formatArrivalWindow, isValidEmail, readReminderStamp, readScheduledWindow,
  resolveReminderRecipient, saveScheduledWindow, sendAppointmentReminder,
} from "@/lib/appointmentReminder";

interface ServiceLike {
  id: string;
  service_date: string | null;
  service_type: string;
  technician?: string | null;
  report_data?: unknown;
}
interface PropertyLike {
  id: string;
  name: string;
  address?: string | null;
  customer_preferences?: unknown;
}
interface LinkLike {
  token: string;
  link_type: string;
  assigned_property_ids?: unknown;
  is_active?: boolean;
}

interface Props {
  service: ServiceLike;
  property: PropertyLike;
  clientId?: string | null;
  clientName?: string;
  links?: LinkLike[];
  propertyType?: "apartments" | "hoa" | "commercial";
  /** Units (apartments/HOA) or areas (commercial) planned for this visit. */
  unitNumbers?: string[];
  /** Called after the window is saved or a reminder is sent (parent refetch). */
  onSaved?: () => void;
  className?: string;
}

const AppointmentReminderControls = ({
  service, property, clientId, clientName, links = [], propertyType = "apartments",
  unitNumbers = [], onSaved, className = "",
}: Props) => {
  const saved = readScheduledWindow(service);
  const stamp = readReminderStamp(service);

  const [start, setStart] = useState(saved?.start || "");
  const [end, setEnd] = useState(saved?.end || "");
  const [savingWindow, setSavingWindow] = useState(false);

  // Re-sync when the parent refetches the row (e.g. after save/refresh).
  useEffect(() => {
    setStart(saved?.start || "");
    setEnd(saved?.end || "");
  }, [service.id, saved?.start, saved?.end]);

  const windowDirty = start !== (saved?.start || "") || (end || "") !== (saved?.end || "");
  const draftWindow = start ? { start, end: end || null } : null;

  const persistWindow = async () => {
    setSavingWindow(true);
    try {
      await saveScheduledWindow(service.id, draftWindow);
      toast({
        title: draftWindow ? "Arrival window saved" : "Arrival window cleared",
        description: draftWindow ? formatArrivalWindow(draftWindow) : undefined,
        duration: 1800,
      });
      onSaved?.();
    } catch (e) {
      toast({ title: "Could not save arrival window", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSavingWindow(false);
    }
  };

  // ─── Reminder dialog ───
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [note, setNote] = useState("");
  const [contactName, setContactName] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingRecipient, setLoadingRecipient] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingRecipient(true);
      let clientEmail: string | null = null;
      if (clientId) {
        const { data } = await supabase.from("portal_clients").select("email").eq("id", clientId).maybeSingle();
        clientEmail = (data as { email?: string | null } | null)?.email || null;
      }
      if (cancelled) return;
      const r = resolveReminderRecipient(property, clientEmail);
      setTo(r.email);
      setContactName(r.name || clientName || "");
      setLoadingRecipient(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const portalUrl = useMemo(() => {
    const prefix = propertyType === "commercial" ? "portal" : "pm";
    const scoped = links.find(
      (l) => l.link_type === "sub" && Array.isArray(l.assigned_property_ids) && l.assigned_property_ids.includes(property.id),
    );
    const any = scoped || links.find((l) => l.is_active !== false);
    if (!any?.token) return null;
    return `${window.location.origin}/${prefix}/${any.token}`;
  }, [links, property.id, propertyType]);

  const email = useMemo(
    () => buildAppointmentReminderEmail({
      contactName,
      propertyName: property.name,
      propertyAddress: property.address || "",
      serviceDate: service.service_date,
      window: draftWindow,
      serviceType: service.service_type,
      routeManager: service.technician || "",
      unitNumbers,
      propertyType,
      message: note,
      portalUrl,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactName, property.name, property.address, service.service_date, start, end, service.service_type, service.technician, unitNumbers.join("|"), propertyType, note, portalUrl],
  );

  const ccList = cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const ccInvalid = ccList.filter((s) => !isValidEmail(s));
  const canSend = isValidEmail(to) && ccInvalid.length === 0 && !sending && !!service.service_date;

  const doSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      // The email shows the draft window — make sure the row matches it.
      if (windowDirty) await saveScheduledWindow(service.id, draftWindow);
      await sendAppointmentReminder({
        serviceId: service.id,
        to,
        cc: ccList,
        subject: email.subject,
        html: email.html,
        propertyName: property.name,
      });
      toast({ title: "Appointment reminder sent", description: `Sent to ${to.trim()}` });
      setOpen(false);
      setNote("");
      onSaved?.();
    } catch (e) {
      toast({ title: "Reminder not sent", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sentLabel = stamp
    ? (() => {
        let when = stamp.sent_at;
        try { when = new Date(stamp.sent_at).toLocaleString(); } catch { /* keep raw ISO */ }
        return `Reminder sent to ${stamp.recipient || "PM"} on ${when}`;
      })()
    : "";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Clock className="w-4 h-4 text-primary shrink-0" />
        <Label className="text-xs font-bold uppercase tracking-wide whitespace-nowrap">Arrival window</Label>
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="time"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-9 text-sm w-[118px] px-2"
          aria-label="Arrival window start"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="time"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-9 text-sm w-[118px] px-2"
          aria-label="Arrival window end"
          disabled={!start}
        />
        <Button
          size="sm"
          variant={windowDirty ? "default" : "outline"}
          className="h-9 px-3 text-xs gap-1"
          disabled={!windowDirty || savingWindow}
          onClick={persistWindow}
        >
          {savingWindow ? "Saving…" : windowDirty ? "Save" : <><Check className="w-3.5 h-3.5" /> Saved</>}
        </Button>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {stamp && (
          <Badge
            title={sentLabel}
            className="text-[10px] bg-emerald-600 text-white border-transparent hover:bg-emerald-600 hidden sm:inline-flex"
          >
            ✓ Reminder sent
          </Badge>
        )}
        <Button
          size="sm"
          className="h-9 px-3 text-xs gap-1.5"
          onClick={() => setOpen(true)}
          title={stamp ? sentLabel : "Email the property manager a reminder for this visit"}
        >
          <Mail className="w-4 h-4" />
          {stamp ? "Resend Appointment Reminder" : "Send Appointment Reminder"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-4 h-4" /> Send Appointment Reminder</DialogTitle>
            <DialogDescription>
              Emails the property manager the date and arrival window for this visit. The preview below is exactly what they'll receive.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_1fr]">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="email"
                  value={to}
                  placeholder={loadingRecipient ? "Loading contact…" : "manager@property.com"}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 text-sm"
                />
                {!loadingRecipient && !to && (
                  <p className="text-[11px] text-amber-700 mt-1">No point-of-contact email on file — enter one above (or add it on the property profile).</p>
                )}
              </div>
              <div>
                <Label className="text-xs">CC (optional)</Label>
                <Input
                  value={cc}
                  placeholder="a@b.com, c@d.com"
                  onChange={(e) => setCc(e.target.value)}
                  className="h-9 text-sm"
                />
                {ccInvalid.length > 0 && <p className="text-[11px] text-destructive mt-1">Check: {ccInvalid.join(", ")}</p>}
              </div>
              <div>
                <Label className="text-xs">Contact name</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-9 text-sm" placeholder="Hello ___," />
              </div>
              <div>
                <Label className="text-xs">Arrival window</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 text-sm px-2" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 text-sm px-2" disabled={!start} />
                </div>
                {!start && <p className="text-[11px] text-amber-700 mt-1">No arrival window set — the email will say the time is still to be confirmed.</p>}
                {windowDirty && start && <p className="text-[11px] text-muted-foreground mt-1">Sending will also save this window on the visit.</p>}
              </div>
              <div>
                <Label className="text-xs">Note from the office (optional)</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Please leave the pool equipment room unlocked."
                  className="min-h-[72px] text-sm"
                />
              </div>
              {!service.service_date && (
                <p className="text-[11px] text-destructive">This visit has no date yet — schedule it first.</p>
              )}
            </div>

            <div className="min-w-0">
              <Label className="text-xs">Preview</Label>
              <p className="text-[11px] text-muted-foreground mb-1 truncate" title={email.subject}>Subject: {email.subject}</p>
              <div className="rounded-md border bg-[#f5f5f5] overflow-hidden">
                <iframe
                  title="Reminder email preview"
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#f5f5f5;}</style></head><body>${email.html}</body></html>`}
                  className="w-full h-[520px] bg-[#f5f5f5]"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button onClick={doSend} disabled={!canSend} className="gap-1.5">
              <Send className="w-4 h-4" />
              {sending ? "Sending…" : "Send Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AppointmentReminderControls;
