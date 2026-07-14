import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, inviteUrl, inviteeName, senderName, roomName } = await req.json();

    if (!email || !inviteUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured in .env" },
        { status: 500 }
      );
    }

    const inviteeNameClean = inviteeName ? inviteeName.trim() : "";
    const senderNameClean = senderName ? senderName.trim() : "Someone";
    const roomNameClean = roomName ? roomName.trim() : "a recording session";

    let fromEmail = process.env.EMAIL_FROM || "Recordly <onboarding@resend.dev>";
    if (process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes("<")) {
      fromEmail = `Recordly <${process.env.EMAIL_FROM}>`;
    }

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `${senderNameClean} invited you to join "${roomNameClean}" on Recordly`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px; line-height: 1.6;">
          <p style="font-size: 16px; margin-bottom: 20px;">Hi ${inviteeNameClean || 'there'},</p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">
            <strong>${senderNameClean}</strong> has invited you to join the recording room "${roomNameClean}" on Recordly.
          </p>
          
          <p style="font-size: 16px; margin-bottom: 20px;">Click the button below to join:</p>
          
          <p style="margin-bottom: 24px;">
            <a href="${inviteUrl}" style="display: inline-block; background-color: #7B5CFF; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
              Join Session
            </a>
          </p>

          <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px; word-break: break-all;">
            Or use this link:<br/>
            <a href="${inviteUrl}" style="color: #7B5CFF;">${inviteUrl}</a>
          </p>

          <p style="font-size: 14px; color: #6b7280; margin-bottom: 24px;">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
          
          <p style="font-size: 16px; margin: 0;">
            — The Recordly Team
          </p>
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
