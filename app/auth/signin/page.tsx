"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      name,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Something went wrong. Please try again.");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            Sign in to Recordly
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Enter your email to sign in or create an account
          </p>
        </div>

        <div className="w-full max-w-md bg-[var(--bg-secondary)] shadow-[var(--shadow-elevated)] rounded-[var(--radius-lg)] p-8 md:p-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Your Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nirav"
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              error={error || undefined}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!email}
              className="w-full mt-2"
            >
              Continue with Email
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}