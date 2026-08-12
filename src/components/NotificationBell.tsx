import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  notification_type: string;
  is_read: boolean;
  created_at: string;
}

const NotificationBell = ({ className }: { className?: string }) => {
  const staff = useCurrentStaff();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const channelNameRef = useRef(`notifications-bell-${Math.random().toString(36).slice(2)}`);

  const load = async () => {
    if (!staff) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, notification_type, is_read, created_at")
      .or(`recipient_username.eq.${staff.username},recipient_username.is.null`)
      .order("created_at", { ascending: false })
      .limit(25);
    if (data) setItems(data as Notification[]);
  };

  useEffect(() => {
    load();
    if (!staff) return;
    // Realtime subscription for new notifications
    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => load(),
      )
      .subscribe();
    // Periodic fallback poll (cheap)
    const t = setInterval(load, 60000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.username]);

  if (!staff) return null;

  const unread = items.filter(i => !i.is_read).length;

  const markAllRead = async () => {
    const ids = items.filter(i => !i.is_read).map(i => i.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    load();
  };

  const onClickItem = async (n: Notification) => {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) navigate(n.link);
    else navigate("/notifications");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative h-9 w-9 max-md:h-11 max-md:w-11", className)}
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center text-[10px]"
              variant="destructive"
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="font-semibold text-sm">Notifications</p>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 max-md:py-2 max-md:px-1 max-md:-my-2"
            >
              Mark all read
            </button>
            <button
              onClick={() => { setOpen(false); navigate("/notifications"); }}
              className="text-xs text-primary hover:underline max-md:py-2 max-md:px-1 max-md:-my-2"
            >
              View all
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                onClick={() => onClickItem(n)}
                className={cn(
                  "w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors",
                  !n.is_read && "bg-primary/5",
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;