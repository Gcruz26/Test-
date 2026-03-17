import { InterpreterEditor } from "../../../../../src/components/interpreters/InterpreterEditor";

type EditInterpreterRouteProps = {
  params: Promise<{ id: string }>;
};

export default async function EditInterpreterRoute({ params }: EditInterpreterRouteProps) {
  const { id } = await params;
  const interpreterId = Number(id);

  return (
    <section className="grid gap-5">
      <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,_#08111f,_#132a41_52%,_#154c5d)] px-7 py-8 text-slate-50 shadow-[0_22px_60px_rgba(15,23,42,0.18)]">
        <p className="eyebrow !text-cyan-200">Interpreter operations workspace</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Edit Interpreter</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-200/80">
          Update the interpreter profile, including client-specific platform IDs.
        </p>
      </div>
      <InterpreterEditor interpreterId={interpreterId} />
    </section>
  );
}
