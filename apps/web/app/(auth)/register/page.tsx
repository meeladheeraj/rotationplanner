import { AuthForm } from "@/components/AuthForm";
import { AuthLayout } from "@/components/AuthLayout";

export default function RegisterPage() {
  return (
    <AuthLayout
      heading="Create your account"
      subheading="Set up your organization and build a validated roster in minutes."
    >
      <AuthForm mode="register" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />
    </AuthLayout>
  );
}
