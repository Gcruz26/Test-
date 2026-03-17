import { ReportSummariesPage } from "../../../src/screens/ReportSummariesPage";

type Props = {
  searchParams?: Promise<{ intakeId?: string }>;
};

export default async function ReportSummariesRoute({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const requestedIntakeId = Number(resolvedSearchParams?.intakeId ?? "");

  return <ReportSummariesPage requestedIntakeId={Number.isFinite(requestedIntakeId) ? requestedIntakeId : null} />;
}
