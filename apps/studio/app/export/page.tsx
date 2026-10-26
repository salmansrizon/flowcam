import Exporter from "@/modules/export/Exporter";

export default async function ExportPage({ searchParams }: PageProps<"/export">) {
  const { recording } = await searchParams;
  if (typeof recording !== "string") return <main style={{ padding: 32 }}>No Recording chosen.</main>;
  return <Exporter recordingId={recording} />;
}
