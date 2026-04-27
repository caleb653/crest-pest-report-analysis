import { User, Phone, Mail, MapPin } from "lucide-react";
import type { ResidentContact } from "@/lib/residentContact";

/**
 * Compact "who reported this" card. Used in both the PM portal and the
 * Admin Property Dashboard so HOA service requests always surface the
 * resident's name, address, phone, and email front-and-center instead of
 * leaving them buried inside the request description.
 */
export function ResidentContactCard({
  contact,
  className = "",
}: {
  contact: ResidentContact;
  className?: string;
}) {
  if (!contact.hasAny) return null;
  return (
    <div className={`rounded-lg border-2 border-primary/50 bg-primary/[0.05] p-2.5 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-primary mb-1.5 flex items-center gap-1">
        <User className="w-3 h-3" />Resident Contact
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {contact.name && (
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-semibold truncate">{contact.name}</span>
          </div>
        )}
        {contact.address && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate">{contact.address}</span>
          </div>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:underline">
            <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate">{contact.phone}</span>
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:underline">
            <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate">{contact.email}</span>
          </a>
        )}
      </div>
    </div>
  );
}