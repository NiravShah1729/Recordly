// src/app/dashboard/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-2xl font-bold">
        Welcome, {session.user?.name}! 👋
      </h1>
      <p className="text-gray-400 mt-2">
        You are signed in as {session.user?.email}
      </p>
    </div>
  );
}
