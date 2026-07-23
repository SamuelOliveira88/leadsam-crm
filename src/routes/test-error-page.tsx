import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { testThrow } from "@/lib/test-error.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/test-error-page")({
  component: TestErrorPage,
});

function TestErrorPage() {
  const [result, setResult] = useState<string>("");
  const fn = useServerFn(testThrow);

  return (
    <div className="p-8">
      <h1 className="text-xl font-bold mb-4">Teste de erro</h1>
      <Button
        onClick={async () => {
          console.log("clicou");
          try {
            const r = await fn();
            console.log("resposta:", r);
            setResult(`Sucesso: ${JSON.stringify(r)}`);
          } catch (e: any) {
            console.error("Erro capturado:", e);
            setResult(`Erro: ${e?.message ?? JSON.stringify(e)}`);
          }
        }}
      >
        Disparar erro
      </Button>
      <pre className="mt-4 p-4 bg-muted rounded">{result}</pre>
    </div>
  );
}
