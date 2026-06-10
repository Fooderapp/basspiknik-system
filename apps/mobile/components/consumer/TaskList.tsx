import { useCallback, useState } from "react";
import { View, Linking, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Gift, Instagram, Facebook, Youtube, Check, Clock, Hourglass, ExternalLink, type LucideIcon,
} from "lucide-react-native";
import { Card } from "@/components/ui/Card";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAuth } from "@/context/auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

interface Task {
  id: string; title: string; description: string | null; platform: string;
  url: string | null; ctaLabel: string; reward: number; repeatable: boolean;
  requiresReview: boolean; state: "available" | "done" | "pending" | "cooldown"; cooldownLeftMs: number;
}

const ICON: Record<string, LucideIcon> = { instagram: Instagram, facebook: Facebook, youtube: Youtube };

export function TaskList() {
  const { session } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!session || !API_URL) { setLoaded(true); return; }
    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const d = await res.json();
      setTasks(d.tasks ?? []);
    } catch { /* ignore */ } finally { setLoaded(true); }
  }, [session]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function claim(t: Task) {
    if (!session) return;
    setBusy(t.id);
    try {
      const res = await fetch(`${API_URL}/api/tasks/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ taskId: t.id }),
      });
      await res.json();
      setArmed((a) => ({ ...a, [t.id]: false }));
      await load();
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  function onCta(t: Task) {
    if (t.url && !armed[t.id]) {
      Linking.openURL(t.url).catch(() => {});
      setArmed((a) => ({ ...a, [t.id]: true }));
      return;
    }
    void claim(t);
  }

  if (!loaded || tasks.length === 0) return null;

  return (
    <View className="px-5 mt-10">
      <View className="flex-row items-center gap-2 mb-3">
        <Gift size={18} color="#EBE05A" strokeWidth={2} />
        <Text className="text-foreground text-lg font-bold tracking-tight">Earn credits</Text>
      </View>

      <View className="gap-2">
        {tasks.map((t) => {
          const Icon = ICON[t.platform] ?? Gift;
          const done = t.state === "done";
          const pending = t.state === "pending";
          const cooldown = t.state === "cooldown";
          return (
            <Card key={t.id} className="flex-row items-center gap-3 p-3.5">
              <View className="w-10 h-10 rounded-full items-center justify-center bg-secondary">
                <Icon size={18} color="#f5f5f5" strokeWidth={1.75} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold" numberOfLines={2}>{t.title}</Text>
                {t.description && <Text className="text-muted-foreground text-xs" numberOfLines={2}>{t.description}</Text>}
              </View>
              <Badge label={`+${t.reward}`} variant="secondary" />

              {done ? (
                <View className="flex-row items-center gap-1">
                  <Check size={16} color="#9FE870" strokeWidth={2} />
                  <Text className="text-xs font-medium" style={{ color: "#9FE870" }}>Done</Text>
                </View>
              ) : pending ? (
                <View className="flex-row items-center gap-1">
                  <Hourglass size={14} color="#9a9a9a" strokeWidth={2} />
                  <Text className="text-muted-foreground text-xs">In review</Text>
                </View>
              ) : cooldown ? (
                <View className="flex-row items-center gap-1">
                  <Clock size={14} color="#9a9a9a" strokeWidth={2} />
                  <Text className="text-muted-foreground text-xs">Later</Text>
                </View>
              ) : (
                <PressableScale pressedScale={0.96} onPress={() => onCta(t)} disabled={busy === t.id}>
                  <View
                    className="flex-row items-center gap-1.5 rounded-lg px-3 py-2"
                    style={{ backgroundColor: "#EBE05A" }}
                  >
                    {busy === t.id ? (
                      <ActivityIndicator size="small" color="#323000" />
                    ) : (
                      <>
                        {t.url && !armed[t.id] && <ExternalLink size={13} color="#323000" strokeWidth={2} />}
                        <Text className="text-xs font-semibold" style={{ color: "#323000" }}>
                          {armed[t.id] ? "I did it" : t.ctaLabel}
                        </Text>
                      </>
                    )}
                  </View>
                </PressableScale>
              )}
            </Card>
          );
        })}
      </View>
    </View>
  );
}
