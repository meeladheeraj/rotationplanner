import { Suspense } from "react";

import { AuthLayout } from "@/components/AuthLayout";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthLayout heading="Set a new password" subheading="Choose a new password for your account.">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
