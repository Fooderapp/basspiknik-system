import { NativeTabs } from "expo-router/unstable-native-tabs";

// iOS 26 liquid-glass system tab bar. Four primary destinations; staff tools
// (POS / Check-in / Bartender) live as a role-gated section inside Profile.
// Compass route still exists but is hidden from the tab bar.
export default function TabsLayout() {
  return (
    <NativeTabs tintColor="#9fe870">
      <NativeTabs.Trigger name="tickets">
        <NativeTabs.Trigger.Label>Tickets</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "ticket", selected: "ticket.fill" }} drawable="ic_menu_gallery" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="buy">
        <NativeTabs.Trigger.Label>Buy</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "cart", selected: "cart.fill" }} drawable="ic_menu_add" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Label>Bar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="wineglass" drawable="ic_menu_view" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} drawable="ic_menu_myplaces" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
