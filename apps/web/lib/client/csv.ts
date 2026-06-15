import { schedToBlocks, type InternSchedule, type Department } from "@rp/engine";

// Browser CSV export, ported from rotation_planner.jsx exportCSV.
export function exportScheduleCsv(
  internSchedules: InternSchedule[],
  departments: Department[],
): void {
  const rows = ["Intern ID,Block,Department,Start Week,End Week,Duration"];
  for (const { id, schedule } of internSchedules) {
    schedToBlocks(schedule).forEach((b, i) => {
      const name = departments[b.dept]?.name ?? `Dept ${b.dept}`;
      rows.push(
        [id, i + 1, `"${name}"`, b.start + 1, b.end + 1, b.end - b.start + 1].join(","),
      );
    });
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rotation_schedule_${internSchedules.length}_interns.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
