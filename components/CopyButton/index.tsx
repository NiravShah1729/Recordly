"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}