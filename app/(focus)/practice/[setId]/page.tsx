export default async function PracticeSetPage({ params }: PageProps<"/practice/[setId]">) {
  const { setId } = await params;
  return (
    <main className="flex flex-1 flex-col px-10 pt-7 pb-8">
      <h1 className="text-lg font-normal tracking-display">Practice · {setId}</h1>
    </main>
  );
}
