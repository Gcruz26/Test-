import { LoginPage } from "../../src/screens/LoginPage";

type LoginRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginRoute({ searchParams }: LoginRouteProps) {
  const params = await searchParams;
  const nextValue = params.next;
  const nextPath = typeof nextValue === "string" && nextValue.startsWith("/") ? nextValue : "/dashboard";

  return <LoginPage nextPath={nextPath} />;
}
