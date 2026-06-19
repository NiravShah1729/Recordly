// src/lib/auth.ts

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  // ── Adapter ───────────────────────────────────────────────
  // Tells NextAuth to store sessions in YOUR database
  // This means when someone logs in, a row is created
  // in your Session table automatically
  adapter: PrismaAdapter(prisma) as any,

  // ── Session Strategy ──────────────────────────────────────
  // "jwt" = store session info in a cookie as an encrypted token
  // Alternative is "database" but JWT is simpler to start with
  session: { strategy: "jwt" },

  secret: process.env.NEXTAUTH_SECRET,

  // ── Providers ─────────────────────────────────────────────
  // Providers = the ways users can log in
  // We're using "Credentials" = simple email input
  // (In production you'd add Google, GitHub, etc.)
  providers: [
    CredentialsProvider({
      name: "Email",
      // These define what fields appear on the login form
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        name:  { label: "Name",  type: "text",  placeholder: "Your name" },
      },

      // This function runs when someone submits the login form
      // It receives the form values and must return a user object or null
      async authorize(credentials) {
        if (!credentials?.email) return null;

        // "upsert" = update if exists, create if doesn't
        // This means our login form also acts as registration
        // Perfect for development — just type an email and you're in
        const user = await prisma.user.upsert({
          where:  { email: credentials.email },
          update: { name: credentials.name ?? undefined },
          create: {
            email: credentials.email,
            name:  credentials.name ?? credentials.email.split("@")[0],
          },
        });

        // Returning the user object means "login successful"
        // Returning null means "login failed"
        return {
          id:    user.id,
          email: user.email,
          name:  user.name,
        };
      },
    }),
  ],

  // ── Callbacks ─────────────────────────────────────────────
  // Callbacks run at specific points in the auth flow
  // We use them to attach extra data to the session

  callbacks: {
    // jwt callback runs when the JWT token is created/updated
    // We add the userId to the token so we can use it later
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id; // attach userId to the token
      }
      return token;
    },

    // session callback runs when getServerSession() or useSession() is called
    // We take the userId from the token and put it on the session object
    // This is how your components know WHO is logged in
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as any).id = token.userId as string;
      }
      return session;
    },
  },

  // ── Custom Pages ──────────────────────────────────────────
  // Tell NextAuth to use OUR sign-in page instead of its default one
  pages: {
    signIn: "/auth/signin",
  },
};