import { ReportSummariesPage } from "../../../../src/screens/ReportSummariesPage";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ReportSummaryDetailRoute({ params }: Props) {
  const resolvedParams = await params;
  const intakeId = Number(resolvedParams.id);

  return <ReportSummariesPage initialIntakeId={Number.isFinite(intakeId) ? intakeId : null} />;
}
