import React from "react";
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import QRCode from "qrcode";

const TIER_COLORS: Record<string, string> = {
  VIP:        "#7c3aed",
  EARLY_BIRD: "#1d4ed8",
  GENERAL:    "#374151",
  LATE:       "#c2410c",
  DOOR:       "#92400e",
  FREE:       "#166534",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#f3f4f6",
    padding: 32,
    fontFamily: "Helvetica",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    marginBottom: 20,
    overflow: "hidden",
  },
  tierBar: {
    height: 6,
  },
  cardBody: {
    padding: 24,
    flexDirection: "row",
    gap: 20,
    alignItems: "flex-start",
  },
  qrWrap: {
    width: 120,
    height: 120,
    flexShrink: 0,
  },
  qrImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  info: {
    flex: 1,
  },
  tierBadge: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  ticketName: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 2,
  },
  holderName: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 10,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 9,
    color: "#9ca3af",
    width: 60,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 9,
    color: "#374151",
    flex: 1,
  },
  qrCode: {
    fontSize: 7,
    color: "#9ca3af",
    fontFamily: "Helvetica",
    marginTop: 8,
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
  header: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 10,
    color: "#9ca3af",
  },
  eventInfoBox: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  eventName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 8,
  },
  ticketsLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
});

export interface PdfTicketInput {
  eventName: string;
  eventDate: string;
  eventVenue?: string;
  orderId: string;
  tickets: Array<{
    id: string;
    qrCode: string;
    ticketName: string;
    tier: string;
    holderName?: string;
  }>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export async function generateTicketPdf(input: PdfTicketInput): Promise<Buffer> {
  // Generate QR PNGs as base64 data URIs
  const qrDataUris = await Promise.all(
    input.tickets.map((t) =>
      QRCode.toDataURL(t.qrCode, { width: 240, margin: 2, color: { dark: "#000000", light: "#ffffff" } })
    )
  );

  const doc = (
    <Document title={`Tickets — ${input.eventName}`} author="EventOS">
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🎫 EventOS</Text>
          <Text style={styles.headerSub}>Your tickets are confirmed</Text>
        </View>

        {/* Event info */}
        <View style={styles.eventInfoBox}>
          <Text style={styles.eventName}>{input.eventName}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{formatDate(input.eventDate)}</Text>
          </View>
          {input.eventVenue && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Venue</Text>
              <Text style={styles.metaValue}>{input.eventVenue}</Text>
            </View>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Order</Text>
            <Text style={styles.metaValue}>{input.orderId.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>

        {/* Ticket label */}
        <Text style={styles.ticketsLabel}>Your Tickets ({input.tickets.length})</Text>

        {/* Ticket cards */}
        {input.tickets.map((t, i) => {
          const color = TIER_COLORS[t.tier] ?? "#374151";
          return (
            <View key={t.id} style={styles.card}>
              {/* Tier colour bar */}
              <View style={[styles.tierBar, { backgroundColor: color }]} />

              <View style={styles.cardBody}>
                {/* QR code */}
                <View style={styles.qrWrap}>
                  <Image src={qrDataUris[i]} style={styles.qrImage} />
                  <Text style={styles.qrCode}>{t.qrCode}</Text>
                </View>

                {/* Info */}
                <View style={styles.info}>
                  <Text style={[styles.tierBadge, { color }]}>
                    {t.tier.replace("_", " ")}
                  </Text>
                  <Text style={styles.ticketName}>{t.ticketName}</Text>
                  {t.holderName && (
                    <Text style={styles.holderName}>{t.holderName}</Text>
                  )}
                  <View style={styles.divider} />
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Event</Text>
                    <Text style={styles.metaValue}>{input.eventName}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Date</Text>
                    <Text style={styles.metaValue}>{formatDate(input.eventDate)}</Text>
                  </View>
                  {input.eventVenue && (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Venue</Text>
                      <Text style={styles.metaValue}>{input.eventVenue}</Text>
                    </View>
                  )}
                  {input.tickets.length > 1 && (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Ticket</Text>
                      <Text style={styles.metaValue}>{i + 1} of {input.tickets.length}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Show the QR code at the entrance · Powered by EventOS
          </Text>
        </View>

      </Page>
    </Document>
  );

  return renderToBuffer(doc) as Promise<Buffer>;
}
