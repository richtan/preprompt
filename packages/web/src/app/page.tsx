export default function Home() {
  return (
    <main className="max-w-[720px] mx-auto px-4 py-16">
      <h1 className="text-3xl font-semibold mb-2">PrePrompt</h1>
      <p className="text-[var(--dim)] mb-8">
        Test any prompt on every AI tool.
      </p>
      <pre className="text-sm mb-8 text-[var(--dim)]">
{`npm install -g preprompt
preprompt "Create an Express server with TypeScript"`}
      </pre>
      <a
        href="https://github.com/richtan/preprompt"
        className="text-[var(--pass)] hover:underline"
      >
        github.com/richtan/preprompt
      </a>
    </main>
  );
}
