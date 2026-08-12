import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bell, Check } from "lucide-react";
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
  recipient_name: string | null;
}

const Notifications = () => {
  const navigate = useNavigate();
  const staff = useCurrentStaff();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = async () => {
    if (!staff) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, link, notification_type, is_read, created_at, recipient_name")
      .or(`recipient_username.eq.${staff.username},recipient_username.is.null`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setItems(data as Notification[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff?.username]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    load();
  };

  const markAllRead = async () => {
    const ids = items.filter(i => !i.is_read).map(i => i.id);
    if (ids.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    load();
  };

  const visible = filter === "unread" ? items.filter(i => !i.is_read) : items;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Bell className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold flex-1">Notifications</h1>
          {staff && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              Signed in as {staff.fullName}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 max-sm:flex-wrap max-sm:gap-2">
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All ({items.length})
            </Button>
            <Button
              variant={filter === "unread" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("unread")}
            >
              Unread ({items.filter(i => !i.is_read).length})
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={markAllRead}>
            <Check className="w-4 h-4 mr-1" />Mark all read
          </Button>
        </div>

        {!staff ? (
          <Card className="p-8 text-center text-muted-foreground">
            Please log in to view your notifications.
          </Card>
        ) : visible.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
            No {filter === "unread" ? "unread " : ""}notifications
          </Card>
        ) : (
          <div className="space-y-2">
            {visible.map(n => (
              <Card
                key={n.id}
                className={cn(
                  "p-4 cursor-pointer hover:bg-muted/30 transition-colors",
                  !n.is_read && "border-primary/40 bg-primary/5",
                )}
                onClick={() => {
                  if (!n.is_read) markRead(n.id);
                  if (n.link) navigate(n.link);
                }}
              >
                <div className="flex items-start gap-3">
                  {!n.is_read && (
                    <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{n.title}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {n.notification_type.replace("_", " ")}
                      </Badge>
                    </div>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;