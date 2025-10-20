
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";


async function postQuery(query: string) {
  const response = await fetch("/api/lightrag/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.details || "Failed to fetch from LightRAG API");
  }

  return response.json();
}

export function LightragQuery() {
  const [query, setQuery] = useState("");

  const mutation = useMutation({
    mutationFn: postQuery,
    onSuccess: (data) => {
      toast.success("Query successful!");
      console.log(data);
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
      console.error(error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.warning("Please enter a query.");
      return;
    }
    mutation.mutate(query);
  };

  return (
    <>
      <Toaster richColors position="top-right" />
      <Card className="w-full">
        <CardHeader>
          <CardTitle>LightRAG Knowledge Query</CardTitle>
          <CardDescription>
            Ask a question to the LightRAG knowledge graph. The system will use its indexed knowledge to provide an answer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
            <Input
              type="text"
              placeholder="e.g., What is Alice Semantic Bridge?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={mutation.isPending}
              className="flex-grow"
            />
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Querying..." : "Ask"}
            </Button>
          </form>
        </CardContent>
        {mutation.isSuccess && (
          <CardFooter className="flex flex-col items-start gap-4 rounded-lg bg-muted p-4">
            <div className="w-full">
              <p className="text-sm font-semibold text-primary">Query:</p>
              <p className="text-sm text-muted-foreground">{mutation.data.query}</p>
            </div>
            <div className="w-full">
              <p className="text-sm font-semibold text-primary">Answer:</p>
              <p className="text-sm">{mutation.data.answer}</p>
            </div>
            <div className="w-full">
              <p className="text-sm font-semibold text-primary">Source:</p>
              <p className="text-xs uppercase font-mono tracking-wider rounded-md bg-secondary px-2 py-1 text-secondary-foreground">{mutation.data.source}</p>
            </div>
          </CardFooter>
        )}
        {mutation.isError && (
          <CardFooter>
            <p className="text-sm text-destructive">Error: {mutation.error.message}</p>
          </CardFooter>
        )}
      </Card>
    </>
  );
}
