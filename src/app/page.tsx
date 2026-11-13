import { Button } from "@heroui/react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-sans text-3xl font-bold">Job Digger</h1>
      <p className="text-sm text-gray-500">
        Career pages and vacancy monitoring
      </p>
      <Button>Check all</Button>
    </main>
  );
}
