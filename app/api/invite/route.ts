import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, inviteUrl } = await req.json();

    if (!email || !inviteUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured in .env" },
        { status: 500 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: "Recordly <onboarding@resend.dev>",
      to: email,
      subject: "You've been invited to a Recordly session!",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 600; margin-bottom: 16px;">You've been invited to join a recording session.</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
            Hi there,
            <br /><br />
            You have been invited to join a professional recording session on Recordly. Please follow the instructions below to join.
          </p>
          
          <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
            <h3 style="color: #1a1a1a; font-size: 16px; font-weight: 600; margin-bottom: 12px; margin-top: 0;">How to join:</h3>
            <ol style="color: #4a4a4a; font-size: 14px; line-height: 1.6; margin-bottom: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Click the <strong>Join Session</strong> button below.</li>
              <li style="margin-bottom: 8px;">When prompted by your browser, <strong>allow access</strong> to your camera and microphone.</li>
              <li style="margin-bottom: 8px;">You will enter the green room to check your video and audio.</li>
              <li>Click <strong>Join Studio</strong> to enter the recording session.</li>
            </ol>
          </div>

          <div style="text-align: center; margin-bottom: 28px;">
            <a href="${inviteUrl}" style="display: inline-block; background-color: #7B5CFF; color: #ffffff; font-weight: 500; font-size: 16px; text-decoration: none; padding: 14px 28px; border-radius: 8px; transition: background-color 0.2s;">
              Join Session
            </a>
          </div>

          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px;">
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px; margin-top: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
            <a href="${inviteUrl}" style="color: #7B5CFF; font-size: 14px; text-decoration: underline; word-break: break-all;">
              ${inviteUrl}
            </a>
          </div>

          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              Powered by Recordly<br />
              High-quality local recording and real-time collaboration.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Resend Error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Invite Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
