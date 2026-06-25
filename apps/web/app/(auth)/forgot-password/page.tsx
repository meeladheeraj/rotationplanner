import Link from "next/link";

import { AuthLayout } from "@/components/AuthLayout";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout heading="Forgot your password?" subheading="Here's how to get back in.">
      <div className="space-y-4 text-sm text-slate-600">
        <p>Self-service password reset isn&apos;t available yet. To regain access:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            If you&apos;re a team member, ask your organization&apos;s <strong>owner</strong> to set a new
            password for you.
          </li>
          <li>If you&apos;re the owner and locked out, contact support to restore access.</li>
        </ul>
        <Link
          href="/login"
          className="inline-block font-medium text-brand hover:underline"
        >
          ← Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}
