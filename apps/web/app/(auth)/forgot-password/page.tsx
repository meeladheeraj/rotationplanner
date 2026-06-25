import { AuthLayout } from "@/components/AuthLayout";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      heading="Forgot your password?"
      subheading="Enter your email and we'll send a reset link."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
