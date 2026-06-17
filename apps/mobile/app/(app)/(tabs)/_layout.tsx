import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useLanguage } from "@/context/language";

export default function TabsLayout() {
  const { dict } = useLanguage();
  return (
    <NativeTabs tintColor="#163300">
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>{dict["tabs.home"]}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} drawable="ic_menu_home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="buy">
        <NativeTabs.Trigger.Label>{dict["tabs.buy"]}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "cart", selected: "cart.fill" }} drawable="ic_menu_add" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Label>{dict["tabs.bar"]}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wineglass" drawable="ic_menu_view" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{dict["tabs.profile"]}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} drawable="ic_menu_myplaces" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
