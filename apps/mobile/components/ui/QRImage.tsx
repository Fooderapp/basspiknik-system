import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";

/** Renders a QR code as a live SVG.
 *
 *  Earlier this component rasterised the QR to a PNG (via getRef + toDataURL)
 *  to dodge an iOS 3D-compositing bug when a QR sat inside a perspective-tilted
 *  parent (TiltCard) — the SVG split into two triangles, one backed black.
 *
 *  That async raster step was fragile: toDataURL sometimes never fired, leaving
 *  a blank white square (the "white-on-white QR" bug). The QR is now drawn flat
 *  (no 3D-rotated parent), so the live SVG composites cleanly — render it
 *  directly and synchronously. */
export function QRImage({
  value,
  size,
  color = "#000000",
  backgroundColor = "#ffffff",
}: {
  value: string;
  size: number;
  color?: string;
  backgroundColor?: string;
}) {
  return (
    <View style={{ width: size, height: size }}>
      <QRCode value={value} size={size} color={color} backgroundColor={backgroundColor} />
    </View>
  );
}
