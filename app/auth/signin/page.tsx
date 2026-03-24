// src/app/auth/signin/page.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [email,   setEmail]   = useState("");
  const [name,    setName]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Recordly</h1>
          <p className="text-gray-400">Enter your email to sign in or create an account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-2xl p-8 space-y-4 border border-gray-800"
        >
          <div>
            <label className="block text-sm text-gray-400 mb-1">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nirav"
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 
                         border border-gray-700 focus:border-indigo-500 
                         focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 
                         border border-gray-700 focus:border-indigo-500 
                         focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900
                       disabled:cursor-not-allowed text-white font-semibold rounded-lg 
                       px-4 py-3 transition-colors"
          >
            {loading ? "Signing in..." : "Continue with Email →"}
          </button>
        </form>

      </div>
    </div>
  );
}