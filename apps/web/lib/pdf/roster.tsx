/**
 * Server-side PDF rendering of a roster via @react-pdf/renderer.
 * Node runtime only (imported from a route handler with runtime = "nodejs").
 */
import * as React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ScheduleDetail } from "@/lib/data/schedules";

export interface RosterPdfInput {
  configName: string;
  totalWeeks: number;
  version: number;
  status: string;
  generatedAt: Date;
  assignments: ScheduleDetail["assignments"];
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  meta: { fontSize: 9, color: "#64748b", marginBottom: 12 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 3,
  },
  internCell: { width: 90, fontFamily: "Helvetica-Bold" },
  rotationCell: { flex: 1 },
  block: { color: "#334155" },
});

function rotationLine(rotation: ScheduleDetail["assignments"][number]["rotation"]): string {
  return rotation
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((b) => `${b.deptName} (wk ${b.start + 1}-${b.end + 1})`)
    .join("  •  ");
}

function RosterDoc({ input }: { input: RosterPdfInput }) {
  return (
    <Document
      title={`${input.configName} — roster v${input.version}`}
      author="RotationPlanner"
    >
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <Text style={styles.title}>{input.configName}</Text>
        <Text style={styles.meta}>
          Version {input.version} · {input.status} · {input.totalWeeks} weeks ·{" "}
          {input.assignments.length} interns · generated{" "}
          {new Date(input.generatedAt).toLocaleDateString()}
        </Text>
        {input.assignments.map((a) => (
          <View key={a.internIndex} style={styles.row} wrap={false}>
            <Text style={styles.internCell}>{a.internLabel}</Text>
            <Text style={[styles.rotationCell, styles.block]}>{rotationLine(a.rotation)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderRosterPdf(input: RosterPdfInput): Promise<Buffer> {
  return renderToBuffer(<RosterDoc input={input} />);
}
