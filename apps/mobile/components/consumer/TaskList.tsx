import { useCallback, useState } from "react";
import { View, Linking, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Gift, Instagram, Facebook, Youtube, Check, Clock, Hourglass, ExternalLink, type LucideIcon,
} from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { PressableScale } from "@/components/ui/PressableScale";
import { useAuth } from "@/context/auth";
import { useLanguage } from "@/context/language";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

interface Task {
  id: string; title: string; description: string | null; platform: string;
  url: string | null; ctaLabel: string; reward: number; repeatable: boolean;
  requiresReview: boolean; state: "available" | "done" | "pending" | "cooldown"; cooldownLeftMs: number;
}

const ICON: Record<string, LucideIcon> = { instagram: Instagram, facebook: Facebook, youtube: Youtube };

export function TaskList() {
  const { session } = useAuth();
  const { dict } = useLanguage();
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
        <Gift size={18} color="#163300" strokeWidth={2.25} />
        <Text style={{ color: "#14160F", fontSize: 18, fontWeight: "800", letterSpacing: -0.4 }}>{dict["tasks.earn"]}</Text>
      </View>

      <View className="gap-2.5">
        {tasks.map((t) => {
          const Icon = ICON[t.platform] ?? Gift;
          const done = t.state === "done";
          const pending = t.state === "pending";
          const cooldown = t.state === "cooldown";
          return (
            <View
              key={t.id}
              className="flex-row items-center gap-3 p-3.5"
              style={{ backgroundColor: "#fff", borderRadius: 22, shadowColor: "#14160F", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#DDF2C6" }}>
                <Icon size={18} color="#2C3A18" strokeWidth={1.75} />
              </View>
              <View className="flex-1">
                <Text style={{ color: "#14160F", fontSize: 14, fontWeight: "700" }} numberOfLines={2}>{t.title}</Text>
                {t.description && <Text style={{ color: "#6B6F63", fontSize: 12 }} numberOfLines={2}>{t.description}</Text>}
              </View>
              <View style={{ backgroundColor: "#ECEADD", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "#3A3608", fontSize: 12, fontWeight: "800" }}>+{t.reward}</Text>
              </View>

              {done ? (
                <View className="flex-row items-center gap-1">
                  <Check size={16} color="#3E7B12" strokeWidth={2.5} />
                  <Text style={{ color: "#3E7B12", fontSize: 12, fontWeight: "600" }}>{dict["tasks.done"]}</Text>
                </View>
              ) : pending ? (
                <View className="flex-row items-center gap-1">
                  <Hourglass size={14} color="#9CA093" strokeWidth={2} />
                  <Text style={{ color: "#6B6F63", fontSize: 12 }}>{dict["tasks.review"]}</Text>
                </View>
              ) : cooldown ? (
                <View className="flex-row items-center gap-1">
                  <Clock size={14} color="#9CA093" strokeWidth={2} />
                  <Text style={{ color: "#6B6F63", fontSize: 12 }}>{dict["tasks.later"]}</Text>
                </View>
              ) : (
                <PressableScale pressedScale={0.96} onPress={() => onCta(t)} disabled={busy === t.id}>
                  <View
                    className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2"
                    style={{ backgroundColor: "#16170F" }}
                  >
                    {busy === t.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        {t.url && !armed[t.id] && <ExternalLink size={13} color="#fff" strokeWidth={2} />}
                        <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                          {armed[t.id] ? dict["tasks.did_it"] : t.ctaLabel}
                        </Text>
                      </>
                    )}
                  </View>
                </PressableScale>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
