import { SourceImportDetail } from "../../../src/components/source-import-detail";

export default async function SourceImportDetailPage({ params }: { params: Promise<{ import_attempt_id: string }> }) {
  const { import_attempt_id: importAttemptId } = await params;
  return <SourceImportDetail importAttemptId={importAttemptId} />;
}
