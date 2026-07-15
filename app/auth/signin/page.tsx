"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const result = await signIn("email", {
      email,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setLoading(false);

    if (result?.error) {
      setError("Something went wrong. Please try again.");
    } else if (result?.ok) {
      setSuccess(true);
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
          {success ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-medium text-[var(--text-primary)]">Check your email</h2>
              <p className="text-[var(--text-secondary)]">
                A magic link has been sent to <strong>{email}</strong>. Click the link to log in securely.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
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
          )}
        </div>
      </div>
    </div>
  );
}