type Props = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: Props) {
  return (
    <section className="page-card">
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
