import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { getDictionary, type Dictionary } from "@/lib/i18n";

const CACHE_KEY = "app_language";

interface LanguageContextType {
  lang: string;
  dict: Dictionary;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "hu",
  dict: getDictionary("hu"),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState("hu");

  useEffect(() => {
    // Load cached language immediately, then refresh from DB
    AsyncStorage.getItem(CACHE_KEY).then((cached) => {
      if (cached) setLang(cached);
    });

    (supabase as any)
      .from("app_settings")
      .select("language")
      .maybeSingle()
      .then(({ data }: { data: { language: string } | null }) => {
        const l = data?.language ?? "hu";
        setLang(l);
        AsyncStorage.setItem(CACHE_KEY, l);
      });
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, dict: getDictionary(lang) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
