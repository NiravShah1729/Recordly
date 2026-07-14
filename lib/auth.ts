// src/lib/auth.ts

import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import EmailProvider from "next-auth/providers/email";
import prisma from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const authOptions: NextAuthOptions = {
  // ── Adapter ───────────────────────────────────────────────
  adapter: PrismaAdapter(prisma) as unknown as Adapter,

  // ── Session Strategy ──────────────────────────────────────
  session: { strategy: "jwt" },

  secret: process.env.NEXTAUTH_SECRET,

  // ── Providers ─────────────────────────────────────────────
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
      sendVerificationRequest: async ({ identifier, url, provider }) => {
        try {
          // Robustly rewrite the verification link to use NEXTAUTH_URL domain if configured
          let formattedUrl = url;
          if (process.env.NEXTAUTH_URL) {
            try {
              const targetBase = new URL(process.env.NEXTAUTH_URL);
              const originalUrl = new URL(url);
              originalUrl.protocol = targetBase.protocol;
              originalUrl.host = targetBase.host;
              formattedUrl = originalUrl.toString();
            } catch (err) {
              console.error("Failed to parse NEXTAUTH_URL for rewriting:", err);
            }
          }

          await resend.emails.send({
            from: provider.from,
            to: identifier,
            subject: "Log in to Recordly",
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Welcome to Recordly</h2>
                <p>Click the link below to securely log in to your account:</p>
                <a href="${formattedUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">Log In</a>
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
        session.user.id = token.userId as string;
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