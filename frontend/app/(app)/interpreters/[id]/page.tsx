import { InterpreterProfile } from "../../../../src/components/interpreters/InterpreterProfile";

type InterpreterProfileRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function InterpreterProfileRoute({ params }: InterpreterProfileRouteProps) {
  const { id } = await params;
  const interpreterId = Number(id);

  return (
    <section className="grid gap-5">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#08111f,_#132a41_52%,_#154c5d)] px-7 py-8 text-slate-50 shadow-[0_22px_60px_rgba(15,23,42,0.18)]">
        <p className="eyebrow !text-cyan-200">Interpreter operations workspace</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Interpreter Profile</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-200/80">
          Review the interpreter profile and client platform IDs used across operational systems.
        </p>
      </div>
      <InterpreterProfile interpreterId={interpreterId} />
    </section>
  );
}
