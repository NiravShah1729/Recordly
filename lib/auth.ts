// src/lib/auth.ts

import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import prisma from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const authOptions: NextAuthOptions = {
  // ── Adapter ───────────────────────────────────────────────
  adapter: PrismaAdapter(prisma) as any,

  // ── Session Strategy ──────────────────────────────────────
  session: { strategy: "jwt" },

  secret: process.env.NEXTAUTH_SECRET,

  // ── Providers ─────────────────────────────────────────────
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        try {
          await resend.emails.send({
            from: provider.from,
            to: identifier,
            subject: "Log in to Recordly",
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Welcome to Recordly</h2>
                <p>Click the link below to securely log in to your account:</p>
                <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">Log In</a>
                <p style="margin-top: 20px; font-size: 12px; color: #666;">If you didn't request this email, you can safely ignore it.</p>
              </div>
            `,
          });
        } catch (error) {
          console.error("Failed to send verification email:", error);
          throw new Error("Failed to send verification email");
        }
      },
    }),
  ],

  // ── Callbacks ─────────────────────────────────────────────
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as any).id = token.userId as string;
      }
      return session;
    },
  },

  // ── Custom Pages ──────────────────────────────────────────
  pages: {
    signIn: "/auth/signin",
  },

  debug: true,
};